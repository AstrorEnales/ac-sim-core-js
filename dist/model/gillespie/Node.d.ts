export declare class Node {
    private static ID_COUNTER;
    readonly id: number;
    readonly name: string;
    startCount: bigint;
    constructor(name: string, startCount?: bigint);
}
