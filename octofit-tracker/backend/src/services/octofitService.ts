import mongoose from 'mongoose';
import { Activity, Team, User, Workout } from '../models/index.js';

export async function listActivities() {
  return Activity.find().lean();
}

export async function createActivity(input: unknown) {
  // Reject missing or non-object input
  if (!input || typeof input !== 'object') {
    throw Object.assign(new Error('Request body must be a JSON object'), { status: 400 });
  }
  
  const body = input as Record<string, unknown>;
  
  // Validate required fields
  if (!body.userId || !body.teamId || !body.type || body.minutes === undefined) {
    throw Object.assign(new Error('Missing required fields: userId, teamId, type, minutes'), { status: 400 });
  }
  
  // Validate ObjectIds
  if (!mongoose.Types.ObjectId.isValid(body.userId as string)) {
    throw Object.assign(new Error('Invalid userId format'), { status: 400 });
  }
  if (!mongoose.Types.ObjectId.isValid(body.teamId as string)) {
    throw Object.assign(new Error('Invalid teamId format'), { status: 400 });
  }
  
  // Check user exists
  const user = await User.findById(body.userId);
  if (!user) {
    throw Object.assign(new Error('User not found'), { status: 404 });
  }
  
  // Check team exists
  const team = await Team.findById(body.teamId);
  if (!team) {
    throw Object.assign(new Error('Team not found'), { status: 404 });
  }
  
  try {
    // Create activity with computed fields
    const activity = await Activity.create({
      user: body.userId,
      team: body.teamId,
      type: body.type,
      minutes: body.minutes,
      points: (body.minutes as number) * 1.0,
      occurredAt: new Date(),
    });
    
    return activity.toObject();
  } catch (error) {
    // Handle Mongoose validation errors
    if (error instanceof mongoose.Error.ValidationError) {
      throw Object.assign(new Error('Activity validation failed'), { status: 400 });
    }
    throw error;
  }
}

export async function listTeams() {
  return Team.find().lean();
}

export async function createTeam(input: unknown) {
  // Reject missing or non-object input
  if (!input || typeof input !== 'object') {
    throw Object.assign(new Error('Request body must be a JSON object'), { status: 400 });
  }
  
  const body = input as Record<string, unknown>;
  
  // Validate name is required
  if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
    throw Object.assign(new Error('Team name is required'), { status: 400 });
  }
  
  // Validate member ObjectIds if provided
  if (body.members && Array.isArray(body.members)) {
    for (const memberId of body.members) {
      if (!mongoose.Types.ObjectId.isValid(memberId as string)) {
        throw Object.assign(new Error('Invalid member ID format'), { status: 400 });
      }
    }
  }
  
  try {
    const team = await Team.create({
      name: body.name,
      mascot: body.mascot || '',
      members: (body.members as string[]) || [],
    });
    
    // Reconcile user team references: update each member's User.team and remove from previous teams
    if (body.members && Array.isArray(body.members)) {
      for (const memberId of body.members as string[]) {
        const previousMembership = await User.findById(memberId).select('_id team');
        if (previousMembership?.team && previousMembership.team.toString() !== team._id.toString()) {
          await Team.updateOne({ _id: previousMembership.team }, { $pull: { members: previousMembership._id } });
        }
        await User.updateOne({ _id: memberId }, { $set: { team: team._id } });
      }
    }
    
    return team.toObject();
  } catch (error) {
    // Handle Mongoose validation errors
    if (error instanceof mongoose.Error.ValidationError) {
      throw Object.assign(new Error('Team validation failed'), { status: 400 });
    }
    throw error;
  }
}

export async function getLeaderboard() {
  const results = await Activity.aggregate([
    {
      $group: {
        _id: '$team',
        totalPoints: { $sum: '$points' },
      },
    },
    {
      $lookup: {
        from: 'teams',
        localField: '_id',
        foreignField: '_id',
        as: 'teamData',
      },
    },
    {
      $unwind: '$teamData',
    },
    {
      $sort: { totalPoints: -1 },
    },
    {
      $project: {
        _id: 0,
        teamName: '$teamData.name',
        totalPoints: 1,
      },
    },
  ]);
  
  // Add 1-based rank
  return results.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));
}

export async function suggestWorkouts(userEmail: string) {
  // Find user by email
  const user = await User.findOne({ email: userEmail });
  if (!user) {
    throw Object.assign(new Error('User not found'), { status: 404 });
  }
  
  // Get user's recent activities
  const recentActivities = await Activity.find({ user: user._id })
    .sort({ occurredAt: -1 })
    .limit(1)
    .lean();
  
  // Determine match strategy: prefer fitness goal, fallback to recent activity type
  let matchFocus = user.fitnessGoal;
  if (!matchFocus && recentActivities.length > 0) {
    matchFocus = recentActivities[0].type;
  }
  
  // Find matching workout
  const suggestions = await Workout.find({ focus: matchFocus }).limit(1).lean();
  
  // Add reason field
  if (suggestions.length > 0) {
    const suggestion = suggestions[0] as Record<string, unknown>;
    if (user.fitnessGoal === matchFocus) {
      suggestion.reason = `Matches your ${user.fitnessGoal} goal`;
    } else {
      suggestion.reason = `Based on your recent ${recentActivities[0]?.type || 'activity'}`;
    }
  }
  
  return suggestions;
}

export { User };
