import Decimal from 'decimal.js';
import {StochasticSampler} from './StochasticSampler';
import {RandomGenerator} from '../random/RandomGenerator';
import {erf} from 'mathjs';
import erfinv from '@stdlib/math-base-special-erfinv';

export class TruncatedNormalDistributionSampler implements StochasticSampler {
	private readonly random: RandomGenerator;
	private readonly min: number;
	private readonly max: number;
	private readonly mu: number;
	private readonly sigma: number;
	private readonly cdfMin: number;
	private readonly cdfMax: number;

	constructor(
		random: RandomGenerator,
		min: number,
		max: number,
		mu: number,
		sigma: number
	) {
		this.random = random;
		this.min = min;
		this.max = max;
		this.mu = mu;
		this.sigma = sigma;
		this.cdfMin = (1 + erf((min - mu) / (sigma * Math.sqrt(2)))) * 0.5; // normal cumulative
		this.cdfMax = (1 + erf((max - mu) / (sigma * Math.sqrt(2)))) * 0.5; // normal cumulative
	}

	sample(): Decimal {
		const u =
			this.cdfMin +
			Math.max(1e-10, this.random.nextDouble()) * (this.cdfMax - this.cdfMin);
		const normalQuantile =
			this.mu + this.sigma * Math.sqrt(2) * erfinv(2 * u - 1);
		return Decimal(Math.min(this.max, Math.max(this.min, normalQuantile)));
	}
}
