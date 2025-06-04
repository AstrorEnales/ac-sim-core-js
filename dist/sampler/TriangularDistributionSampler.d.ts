import { default as Decimal } from 'decimal.js';
import { StochasticSampler } from './StochasticSampler';
import { RandomGenerator } from '../random/RandomGenerator';
export declare class TriangularDistributionSampler implements StochasticSampler {
    private readonly random;
    private readonly min;
    private readonly max;
    private readonly c;
    private readonly help;
    constructor(random: RandomGenerator, min: number, max: number, c: number);
    sample(): Decimal;
}
