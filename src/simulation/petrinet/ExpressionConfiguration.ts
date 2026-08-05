import {
	all,
	create,
	EvalFunction,
	MathJsInstance,
	MathNode,
	MathNumericType,
	MathType,
	SymbolNode,
} from 'mathjs';

export class ExpressionConfiguration {
	/**
	 * Reserved symbol which always resolves to the current simulation time and can therefore not be
	 * used as a place or parameter name.
	 */
	public static readonly TIME_SYMBOL = 'time';
	private static _instance: MathJsInstance | null = null;
	private static _functionScope: any | null = null;
	/**
	 * Parsing and compiling an expression is expensive compared to evaluating it, and a simulation
	 * evaluates the same small set of expressions over and over again, so both results are cached.
	 */
	private static readonly _cache = new Map<string, CachedExpression>();
	/**
	 * A single model only contains a small number of expressions, but the cache is shared by all
	 * simulator instances of the process, so it is dropped instead of growing without bounds.
	 */
	private static readonly MAX_CACHE_SIZE = 10000;

	public static get mathjs(): MathJsInstance {
		if (ExpressionConfiguration._instance === null) {
			const instance = create(all, {
				number: 'BigNumber',
				precision: 64,
				predictable: true,
			});
			ExpressionConfiguration._instance = instance;

			const deg = (x: MathType): MathType =>
				instance.divide(instance.multiply(x, 180), instance.pi);
			const rad = (x: MathType): MathType =>
				instance.divide(instance.multiply(x, instance.pi), 180);
			const fractionalPart = (x: MathNumericType): MathNumericType =>
				instance.subtract(x, instance.floor(x));
			const reciprocal = (x: MathType): MathType => instance.divide(1, x);

			// Define the explicitly allowed functions
			ExpressionConfiguration._functionScope = {
				ABS: instance.abs,
				abs: instance.abs,
				ACOS: (value: any) => deg(instance.acos(value)),
				acos: (value: any) => deg(instance.acos(value)),
				ACOSH: instance.acosh,
				acosh: instance.acosh,
				AND: (a: any, b: any) => a && b,
				and: (a: any, b: any) => a && b,
				ACOT: (value: any) =>
					//@ts-ignore
					instance.mod(instance.add(deg(instance.acot(value)), 180), 180),
				acot: (value: any) =>
					//@ts-ignore
					instance.mod(instance.add(deg(instance.acot(value)), 180), 180),
				ACOTH: instance.acoth,
				acoth: instance.acoth,
				ASIN: (value: any) => deg(instance.asin(value)),
				asin: (value: any) => deg(instance.asin(value)),
				ASINH: instance.asinh,
				asinh: instance.asinh,
				ATAN: (value: any) => deg(instance.atan(value)),
				atan: (value: any) => deg(instance.atan(value)),
				ATAN2: (y: any, x: any) => deg(instance.atan2(y, x)),
				atan2: (y: any, x: any) => deg(instance.atan2(y, x)),
				ATANH: instance.atanh,
				atanh: instance.atanh,
				CEIL: instance.ceil,
				ceil: instance.ceil,
				CEILING: instance.ceil,
				ceiling: instance.ceil,
				//@ts-ignore
				COS: (value: any) => instance.cos(rad(value)),
				//@ts-ignore
				cos: (value: any) => instance.cos(rad(value)),
				COSH: instance.cosh,
				cosh: instance.cosh,
				//@ts-ignore
				COT: (value: any) => instance.cot(rad(value)),
				//@ts-ignore
				cot: (value: any) => instance.cot(rad(value)),
				COTH: instance.coth,
				coth: instance.coth,
				//@ts-ignore
				CSC: (value: any) => instance.csc(rad(value)),
				//@ts-ignore
				csc: (value: any) => instance.csc(rad(value)),
				CSCH: instance.csch,
				csch: instance.csch,
				DEG: deg,
				deg: deg,
				E: instance.e,
				e: instance.e,
				EXP: instance.exp,
				exp: instance.exp,
				FACT: instance.factorial,
				fact: instance.factorial,
				FALSE: false,
				FLOOR: instance.floor,
				floor: instance.floor,
				FRACTIONALPART: fractionalPart,
				fractionalpart: fractionalPart,
				GAMMA: instance.gamma,
				gamma: instance.gamma,
				IF: (condition: any, trueValue: any, falseValue: any) =>
					condition === true ? trueValue : falseValue,
				if: (condition: any, trueValue: any, falseValue: any) =>
					condition === true ? trueValue : falseValue,
				INTEGRALPART: instance.floor,
				integralpart: instance.floor,
				LOG: instance.log,
				log: instance.log,
				LOG10: instance.log10,
				log10: instance.log10,
				LOG2: instance.log2,
				log2: instance.log2,
				MAX: instance.max,
				max: instance.max,
				MIN: instance.min,
				min: instance.min,
				NOT: (value: any) => !value,
				not: (value: any) => !value,
				OR: (a: any, b: any) => a || b,
				or: (a: any, b: any) => a || b,
				PI: instance.pi,
				pi: instance.pi,
				RAD: rad,
				rad: rad,
				RECIPROCAL: reciprocal,
				reciprocal: reciprocal,
				ROOT: instance.nthRoot,
				root: instance.nthRoot,
				ROUND: instance.round,
				round: instance.round,
				//@ts-ignore
				SEC: (value: any) => instance.sec(rad(value)),
				//@ts-ignore
				sec: (value: any) => instance.sec(rad(value)),
				SECH: instance.sech,
				sech: instance.sech,
				//@ts-ignore
				SIN: (value: any) => instance.sin(rad(value)),
				//@ts-ignore
				sin: (value: any) => instance.sin(rad(value)),
				SINH: instance.sinh,
				sinh: instance.sinh,
				SQRT: instance.sqrt,
				sqrt: instance.sqrt,
				//@ts-ignore
				TAN: (value: any) => instance.tan(rad(value)),
				//@ts-ignore
				tan: (value: any) => instance.tan(rad(value)),
				TANH: instance.tanh,
				tanh: instance.tanh,
				TRUE: true,
			};
		}
		return ExpressionConfiguration._instance;
	}

	public static evaluate(expression: string, scope?: any): any {
		return ExpressionConfiguration.getCached(expression).code.evaluate(
			scope
				? {
						...ExpressionConfiguration._functionScope,
						...scope,
					}
				: ExpressionConfiguration._functionScope
		);
	}

	/**
	 * Interprets the result of an evaluated expression as a boolean. Comparisons and logical
	 * operators evaluate to a plain boolean, but a condition may also evaluate to a number, which is
	 * false if and only if it is zero. Numbers are represented as objects and would therefore always
	 * be truthy without this conversion.
	 */
	public static toBoolean(value: any): boolean {
		if (typeof value === 'boolean') {
			return value;
		}
		if (typeof value === 'bigint') {
			return value !== 0n;
		}
		if (typeof value === 'number') {
			return value !== 0;
		}
		// BigNumber, Fraction and Complex all provide isZero
		if (value != null && typeof value.isZero === 'function') {
			return !value.isZero();
		}
		return !!value;
	}

	/**
	 * Returns the parsed abstract syntax tree of the given expression. The result is shared with the
	 * expression cache and must not be modified.
	 */
	public static parse(expression: string): MathNode {
		return ExpressionConfiguration.getCached(expression).node;
	}

	/**
	 * Returns all symbols of the given expression which have to be provided by the evaluation scope.
	 * The names of called functions are resolved from the function scope and are not part of the
	 * result.
	 */
	public static getFreeSymbols(expression: string): ReadonlySet<string> {
		return ExpressionConfiguration.getCached(expression).symbols;
	}

	/**
	 * Returns whether the given expression references the reserved time symbol and therefore has to
	 * be evaluated again whenever the simulation time changes.
	 */
	public static dependsOnTime(expression: string): boolean {
		return ExpressionConfiguration.getFreeSymbols(expression).has(
			ExpressionConfiguration.TIME_SYMBOL
		);
	}

	public static clearCache(): void {
		ExpressionConfiguration._cache.clear();
	}

	private static getCached(expression: string): CachedExpression {
		let cached = ExpressionConfiguration._cache.get(expression);
		if (cached === undefined) {
			const node = ExpressionConfiguration.mathjs.parse(
				ExpressionConfiguration.preprocessExpression(expression)
			);
			const symbols = new Set<string>();
			node.traverse(
				(child: MathNode, path: string, parent: MathNode | null) => {
					// The name of a called function is a symbol node as well, but is resolved from the
					// function scope and never has to be provided by the caller
					if (
						child.type === 'SymbolNode' &&
						!(
							parent !== null &&
							parent.type === 'FunctionNode' &&
							path === 'fn'
						)
					) {
						symbols.add((child as SymbolNode).name);
					}
				}
			);
			if (
				ExpressionConfiguration._cache.size >=
				ExpressionConfiguration.MAX_CACHE_SIZE
			) {
				ExpressionConfiguration._cache.clear();
			}
			cached = {node: node, code: node.compile(), symbols: symbols};
			ExpressionConfiguration._cache.set(expression, cached);
		}
		return cached;
	}

	private static preprocessExpression(expression: string): string {
		let result = '';
		let i = 0;
		while (i < expression.length) {
			const ch = expression[i];
			// Skip over string literals (single or double quoted)
			if (ch === '"' || ch === "'") {
				const quote = ch;
				result += ch;
				i++;
				while (i < expression.length) {
					result += expression[i];
					if (expression[i] === '\\') {
						i++;
						if (i < expression.length) {
							result += expression[i];
						}
					} else if (expression[i] === quote) {
						break;
					}
					i++;
				}
				i++;
				continue;
			}
			// Skip over comments (# to end of line)
			if (ch === '#') {
				while (i < expression.length && expression[i] !== '\n') {
					result += expression[i];
					i++;
				}
				continue;
			}
			// Replace && with ' and '
			if (
				ch === '&' &&
				i + 1 < expression.length &&
				expression[i + 1] === '&'
			) {
				result += ' and ';
				i += 2;
				continue;
			}
			// Replace || with ' or '
			if (
				ch === '|' &&
				i + 1 < expression.length &&
				expression[i + 1] === '|'
			) {
				result += ' or ';
				i += 2;
				continue;
			}
			result += ch;
			i++;
		}
		return result;
	}
}

interface CachedExpression {
	readonly node: MathNode;
	readonly code: EvalFunction;
	readonly symbols: ReadonlySet<string>;
}
