import Decimal from 'decimal.js';
import {StochasticSampler} from './StochasticSampler';
import {RandomGenerator} from '../random/RandomGenerator';

export class TriangularDistributionSampler implements StochasticSampler {
	private readonly random: RandomGenerator;
	private readonly min: number;
	private readonly max: number;
	private readonly c: number;
	private readonly help: number;

	constructor(random: RandomGenerator, min: number, max: number, c: number) {
		this.random = random;
		this.min = min;
		this.max = max;
		this.c = c;
		this.help = (this.c - this.min) / (this.max - this.min);
	}

	sample(): Decimal {
		const x = Math.max(1e-10, this.random.nextDouble());
		if (x <= this.help) {
			return Decimal(
				Math.sqrt(x * (this.max - this.min) * (this.c - this.min)) + this.min
			);
		} else {
			return Decimal(
				this.max -
					Math.sqrt((1 - x) * (this.max - this.min) * (this.max - this.c))
			);
		}
	}
}
