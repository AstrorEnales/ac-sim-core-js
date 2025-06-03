import Decimal from 'decimal.js';
import {StochasticSampler} from './StochasticSampler';
import {RandomGenerator} from '../random/RandomGenerator';

export class ExponentialDistributionSampler implements StochasticSampler {
	private readonly random: RandomGenerator;
	private readonly lambda: Decimal;

	constructor(random: RandomGenerator, lambda: number | Decimal) {
		this.random = random;
		this.lambda = Decimal.max(1e-10, lambda);
	}

	sample(): Decimal {
		return Decimal.div(
			-Math.log(Math.max(1e-10, this.random.nextDouble())),
			this.lambda
		);
	}
}
