import { default as Decimal } from 'decimal.js';
import { Node } from './Node';
import { NodeWithQuantity } from './NodeWithQuantity';
/**
 * Context passed to a {@link RateCallback} when the simulator needs the current
 * rate of a reaction. It exposes the reaction itself, the current simulation
 * time and an accessor for the current population of any node, so rates can
 * depend on time and/or species counts.
 */
export interface RateContext {
    readonly reaction: Reaction;
    readonly time: Decimal;
    readonly count: (node: Node) => bigint;
}
/**
 * Result returned by a {@link RateCallback}.
 *
 * `cache`  when `true`, the returned rate is treated as final and the callback
 * is never called again for this reaction (from then on it behaves exactly like
 * a fixed rate). When `false` or omitted, the callback is re-evaluated every
 * step, but the simulator still reuses the cached propensity as long as the
 * returned rate did not change compared to the previous call.
 */
export interface RateResult {
    readonly rate: Decimal | number;
    readonly cache?: boolean;
}
/**
 * A dynamic rate: a callback invoked with the current {@link RateContext} that
 * returns the reaction's current rate (and whether it may be cached).
 */
export type RateCallback = (context: RateContext) => RateResult;
/**
 * A reaction rate, either a fixed {@link Decimal} constant or a
 * {@link RateCallback} for dynamic rates.
 */
export type Rate = Decimal | RateCallback;
export declare class Reaction {
    private static ID_COUNTER;
    readonly id: number;
    readonly name: string;
    readonly from: NodeWithQuantity[];
    readonly to: NodeWithQuantity[];
    readonly rate: Rate;
    constructor(name: string, from: NodeWithQuantity[], to: NodeWithQuantity[], rate?: Rate);
}
/**
 * Type guard telling whether a {@link Rate} is a dynamic {@link RateCallback}.
 */
export declare function isRateCallback(rate: Rate): rate is RateCallback;
