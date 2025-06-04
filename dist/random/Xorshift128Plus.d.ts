import { RandomGenerator } from './RandomGenerator';
export declare class Xorshift128Plus implements RandomGenerator {
    private static NEXT_SEED;
    private state0;
    private state1;
    constructor(seed?: bigint);
    setSeed(seed: bigint): void;
    nextLong(): bigint;
    nextDouble(): number;
}
