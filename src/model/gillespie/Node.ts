export class Node {
	private static ID_COUNTER = 0;
	public readonly id: number = ++Node.ID_COUNTER;
	public readonly name: string;
	public startCount: bigint;

	constructor(name: string, startCount: bigint = 0n) {
		this.name = name;
		this.startCount = startCount;
	}
}
