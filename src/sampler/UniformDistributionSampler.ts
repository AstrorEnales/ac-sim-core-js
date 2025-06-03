import Decimal from 'decimal.js';
import {StochasticSampler} from './StochasticSampler';
import {RandomGenerator} from '../random/RandomGenerator';

export class UniformDistributionSampler implements StochasticSampler {
	private readonly random: RandomGenerator;
	private readonly min: number;
	private readonly max: number;

	constructor(random: RandomGenerator, min: number, max: number) {
		this.random = random;
		this.min = min;
		this.max = max;
	}

	sample(): Decimal {
		return Decimal(
			Math.max(1e-10, this.random.nextDouble()) * (this.max - this.min) +
				this.min
		);
	}
}
