import { default as Decimal } from 'decimal.js';
import { StochasticSampler } from './StochasticSampler';
import { RandomGenerator } from '../random/RandomGenerator';
export declare class TruncatedNormalDistributionSampler implements StochasticSampler {
    private readonly random;
    private readonly min;
    private readonly max;
    private readonly mu;
    private readonly sigma;
    private readonly cdfMin;
    private readonly cdfMax;
    constructor(random: RandomGenerator, min: number, max: number, mu: number, sigma: number);
    sample(): Decimal;
}
