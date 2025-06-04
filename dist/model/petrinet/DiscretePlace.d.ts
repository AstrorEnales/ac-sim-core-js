import { Place } from './Place';
export declare class DiscretePlace extends Place {
    private _tokenStart;
    private _tokenMin;
    private _tokenMax;
    get tokenStart(): bigint;
    set tokenStart(value: bigint);
    get tokenMin(): bigint;
    set tokenMin(value: bigint);
    get tokenMax(): bigint | null;
    set tokenMax(value: bigint | null);
}
