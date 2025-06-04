import { default as Decimal } from 'decimal.js';
import { StochasticSampler } from './StochasticSampler';
import { RandomGenerator } from '../random/RandomGenerator';
export declare class ExponentialDistributionSampler implements StochasticSampler {
    private readonly random;
    private readonly lambda;
    constructor(random: RandomGenerator, lambda: number | Decimal);
    sample(): Decimal;
}
