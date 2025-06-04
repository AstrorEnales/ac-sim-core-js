import { RandomGenerator } from '../../random/RandomGenerator';
import { StochasticSampler } from '../../sampler/StochasticSampler';
import { StochasticDistribution } from './StochasticDistribution';
import { Transition } from './Transition';
export declare class StochasticTransition extends Transition {
    distribution: StochasticDistribution;
    /**
     * probability density
     */
    h: number;
    /**
     * min value
     */
    a: number;
    /**
     * max value
     */
    b: number;
    /**
     * most likely value
     */
    c: number;
    /**
     * expected value
     */
    mu: number;
    /**
     * standard deviation
     */
    sigma: number;
    events: number[];
    probabilities: number[];
    getDistributionSampler(random: RandomGenerator): StochasticSampler | null;
}
