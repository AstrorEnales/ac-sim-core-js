import Decimal from 'decimal.js';
import {StochasticSampler} from './StochasticSampler';
import {RandomGenerator} from '../random/RandomGenerator';

export class DiscreteDistributionSampler implements StochasticSampler {
	private readonly random: RandomGenerator;
	private readonly events: number[];
	private readonly cumulativeProbabilities: number[];

	constructor(
		random: RandomGenerator,
		events: number[],
		probabilities: number[]
	) {
		this.random = random;
		this.events = events;
		this.cumulativeProbabilities = Array(events.length);
		let sum = 0.0;
		for (let i = 0; i < events.length; i++) {
			sum += probabilities[i];
		}
		this.cumulativeProbabilities[0] = probabilities[0] / sum;
		for (let i = 1; i < events.length; i++) {
			this.cumulativeProbabilities[i] =
				this.cumulativeProbabilities[i - 1] + probabilities[i] / sum;
		}
	}

	sample(): Decimal {
		const x = this.random.nextDouble();
		for (let i = 0; i < this.cumulativeProbabilities.length; i++) {
			if (x <= this.cumulativeProbabilities[i]) {
				return Decimal(this.events[i]);
			}
		}
		return Decimal(this.events[this.events.length - 1]);
	}
}
