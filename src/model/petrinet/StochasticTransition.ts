import Decimal from 'decimal.js';
import {RandomGenerator} from '../../random/RandomGenerator';
import {StochasticSampler} from '../../sampler/StochasticSampler';
import {StochasticDistribution} from './StochasticDistribution';
import {Transition} from './Transition';
import {erf} from 'mathjs';
import erfinv from '@stdlib/math-base-special-erfinv';

export class StochasticTransition extends Transition {
	public distribution: StochasticDistribution =
		StochasticDistribution.Exponential;
	/**
	 * probability density
	 */
	public h: number = 1.0;
	/**
	 * min value
	 */
	public a: number = 0;
	/**
	 * max value
	 */
	public b: number = 1;
	/**
	 * most likely value
	 */
	public c: number = 0.5;
	/**
	 * expected value
	 */
	public mu: number = 0.5;
	/**
	 * standard deviation
	 */
	public sigma: number = 0.25;
	public events: number[] = [1, 2, 3, 4];
	public probabilities: number[] = [0.25, 0.25, 0.25, 0.25];

	public getDistributionSampler(
		random: RandomGenerator
	): StochasticSampler | null {
		const a = this.a;
		const b = this.b;
		const c = this.c;
		const mu = this.mu;
		const sigma = this.sigma;
		switch (this.distribution) {
			case StochasticDistribution.Exponential: {
				// Equivalent to PNlib "randomexp.mo"
				const lambda = Math.max(1e-10, this.h);
				return {
					sample() {
						return Decimal(
							-Math.log(Math.max(1e-10, random.nextDouble()) / lambda)
						);
					},
				};
			}
			case StochasticDistribution.Triangular: {
				// Equivalent to PNlib "randomtriangular.mo"
				return {
					sample() {
						const x = Math.max(1e-10, random.nextDouble());
						const help = (c - a) / (b - a);
						if (x <= help) {
							return Decimal(Math.sqrt(x * (b - a) * (c - a)) + a);
						} else {
							return Decimal(b - Math.sqrt((1 - x) * (b - a) * (b - c)));
						}
					},
				};
			}
			case StochasticDistribution.Uniform: {
				// Equivalent to OpenModelica "Distributions.mo"
				return {
					sample() {
						return Decimal(Math.max(1e-10, random.nextDouble()) * (b - a) + a);
					},
				};
			}
			case StochasticDistribution.TruncatedNormal: {
				// Equivalent to OpenModelica "Distributions.mo"
				const cdfMin = (1 + erf((a - mu) / (sigma * Math.sqrt(2)))) * 0.5; // normal cumulative
				const cdfMax = (1 + erf((b - mu) / (sigma * Math.sqrt(2)))) * 0.5; // normal cumulative
				return {
					sample() {
						const u =
							cdfMin + Math.max(1e-10, random.nextDouble()) * (cdfMax - cdfMin);
						const normalQuantile =
							mu + sigma * Math.sqrt(2) * erfinv(2 * u - 1);
						return Decimal(Math.min(b, Math.max(a, normalQuantile)));
					},
				};
			}
			case StochasticDistribution.DiscreteProbability: {
				const events = this.events;
				const probabilities = this.probabilities;
				// Normalize the probabilities
				let sum = 0.0;
				for (let i = 0; i < probabilities.length; i++) {
					sum += probabilities[i];
				}
				for (let i = 0; i < probabilities.length; i++) {
					probabilities[i] /= sum;
				}
				// Equivalent to PNlib "randomdis.mo"
				const cumulativeProbabilities: number[] = new Array(events.length);
				cumulativeProbabilities[0] = probabilities[0];
				for (let i = 1; i < events.length; i++) {
					cumulativeProbabilities[i] =
						cumulativeProbabilities[i - 1] + probabilities[i];
				}
				return {
					sample() {
						const x = random.nextDouble();
						for (let i = 0; i < cumulativeProbabilities.length; i++) {
							if (x <= cumulativeProbabilities[i]) {
								return Decimal(events[i]);
							}
						}
						return Decimal(events[events.length - 1]);
					},
				};
			}
		}
		return null;
	}
}
