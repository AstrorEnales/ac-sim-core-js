import Decimal from 'decimal.js';

export interface StochasticSampler {
	sample(): Decimal;
}
