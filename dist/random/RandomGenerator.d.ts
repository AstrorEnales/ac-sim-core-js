export interface RandomGenerator {
    setSeed(seed: bigint): void;
    nextLong(): bigint;
    nextDouble(): number;
}
