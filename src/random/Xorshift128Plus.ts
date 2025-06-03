import {RandomGenerator} from './RandomGenerator';

export class Xorshift128Plus implements RandomGenerator {
	private static NEXT_SEED = 8682522807148012n;

	private state0 = 0n;
	private state1 = 0n;

	constructor(seed?: bigint) {
		if (seed) {
			this.setSeed(seed);
		} else {
			while (true) {
				const current = Xorshift128Plus.NEXT_SEED;
				const next = current * 1181783497276652981n;
				Xorshift128Plus.NEXT_SEED = next;
				this.setSeed(next ^ BigInt(Date.now()));
				break;
			}
		}
	}

	setSeed(seed: bigint): void {
		this.state0 = seed;
		this.state1 = seed + 1n;
		// Generate numbers trying to leave the worst case startup
		for (let i = 0; i < 50; i++) {
			this.nextLong();
		}
	}

	nextLong(): bigint {
		let x = this.state0;
		const y = this.state1;
		this.state0 = y;
		x = BigInt.asUintN(64, x ^ BigInt.asUintN(64, x << 23n));
		x = BigInt.asUintN(64, x ^ BigInt.asUintN(64, x >> 17n));
		x = BigInt.asUintN(
			64,
			x ^ BigInt.asUintN(64, y ^ BigInt.asUintN(64, y >> 26n))
		);
		this.state1 = x;
		return BigInt.asIntN(64, x + y);
	}

	nextDouble(): number {
		return (
			Number(BigInt.asUintN(64, this.nextLong() & 0x1fffffffffffffn)) /
			Number(BigInt.asUintN(64, 0x1n << 53n))
		);
	}
}
