import { default as Decimal } from 'decimal.js';
export interface StochasticSampler {
    sample(): Decimal;
}
