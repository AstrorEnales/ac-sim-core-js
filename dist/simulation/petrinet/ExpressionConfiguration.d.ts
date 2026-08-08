import { MathJsInstance, MathNode } from 'mathjs';
export declare class ExpressionConfiguration {
    /**
     * Reserved symbol which always resolves to the current simulation time and can therefore not be
     * used as a place or parameter name.
     */
    static readonly TIME_SYMBOL = "time";
    private static _instance;
    private static _functionScope;
    /**
     * Parsing and compiling an expression is expensive compared to evaluating it, and a simulation
     * evaluates the same small set of expressions over and over again, so both results are cached.
     */
    private static readonly _cache;
    /**
     * A single model only contains a small number of expressions, but the cache is shared by all
     * simulator instances of the process, so it is dropped instead of growing without bounds.
     */
    private static readonly MAX_CACHE_SIZE;
    static get mathjs(): MathJsInstance;
    static evaluate(expression: string, scope?: any): any;
    /**
     * Interprets the result of an evaluated expression as a boolean. Comparisons and logical
     * operators evaluate to a plain boolean, but a condition may also evaluate to a number, which is
     * false if and only if it is zero. Numbers are represented as objects and would therefore always
     * be truthy without this conversion.
     */
    static toBoolean(value: any): boolean;
    /**
     * Returns the parsed abstract syntax tree of the given expression. The result is shared with the
     * expression cache and must not be modified.
     */
    static parse(expression: string): MathNode;
    /**
     * Returns all symbols of the given expression which have to be provided by the evaluation scope.
     * The names of called functions are resolved from the function scope and are not part of the
     * result.
     */
    static getFreeSymbols(expression: string): ReadonlySet<string>;
    /**
     * Returns whether the given expression references the reserved time symbol and therefore has to
     * be evaluated again whenever the simulation time changes.
     */
    static dependsOnTime(expression: string): boolean;
    static clearCache(): void;
    private static getCached;
    private static preprocessExpression;
}
