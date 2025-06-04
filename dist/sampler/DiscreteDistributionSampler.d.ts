import { default as Decimal } from 'decimal.js';
import { StochasticSampler } from './StochasticSampler';
import { RandomGenerator } from '../random/RandomGenerator';
export declare class DiscreteDistributionSampler implements StochasticSampler {
    private readonly random;
    private readonly events;
    private readonly cumulativeProbabilities;
    constructor(random: RandomGenerator, events: number[], probabilities: number[]);
    sample(): Decimal;
}
