import {all, create, MathJsInstance, MathNumericType, MathType} from 'mathjs';

export class ExpressionConfiguration {
	private static _instance: MathJsInstance | null = null;
	private static _functionScope: any | null = null;

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
		const ast = ExpressionConfiguration.mathjs.parse(expression);
		return ast.evaluate(
			scope
				? {
						...ExpressionConfiguration._functionScope,
						...scope,
					}
				: ExpressionConfiguration._functionScope
		);
	}
}
