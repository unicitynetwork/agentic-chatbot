import type { ActivityConfig } from '@agentic/shared';
import { triviaActivity } from './trivia.js';
import { amaActivity } from './ama.js';
import { sportsActivity } from './sports.js';
import { gamingActivity } from './games.js';
import { merchActivity } from './merch.js';
import { otcActivity } from './otc.js';
import { eventsActivity } from './events.js';
import { pokemonActivity } from './pokemon.js';

const activities: Record<string, ActivityConfig> = {
    trivia: triviaActivity,
    ama: amaActivity,
    sports: sportsActivity,
    gaming: gamingActivity,
    merch: merchActivity,
    p2p: otcActivity,
    events: eventsActivity,
    pokemon: pokemonActivity,
};

export function getActivityConfig(id: string): ActivityConfig | undefined {
    return activities[id];
}

export function getAllActivities(): ActivityConfig[] {
    return Object.values(activities);
}
