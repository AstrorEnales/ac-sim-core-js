import { MathJsInstance } from 'mathjs';
export declare class ExpressionConfiguration {
    private static _instance;
    private static _functionScope;
    static get mathjs(): MathJsInstance;
    static evaluate(expression: string, scope?: any): any;
}
