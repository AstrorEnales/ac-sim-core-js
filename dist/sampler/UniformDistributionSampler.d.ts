import { default as Decimal } from 'decimal.js';
import { StochasticSampler } from './StochasticSampler';
import { RandomGenerator } from '../random/RandomGenerator';
export declare class UniformDistributionSampler implements StochasticSampler {
    private readonly random;
    private readonly min;
    private readonly max;
    constructor(random: RandomGenerator, min: number, max: number);
    sample(): Decimal;
}
