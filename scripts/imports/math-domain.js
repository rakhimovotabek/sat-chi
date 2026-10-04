export function mathDomain(title) {
  if (
    /Advanced Math|Expressions|Polynomials|Exponents|Radicals|Exponential|Quadratics|Function.*Notation|Special Quadratic/i.test(
      title,
    )
  )
    return "Advanced Math";
  if (
    /Problem.?Solving|Data Analysis|Percent|Ratio|Proportion|Unit Conversion|Probability|Mean|Median|Mode|Range|Scatterplot|Research|Statistics|Standard Deviation/i.test(
      title,
    )
  )
    return "Problem-Solving and Data Analysis";
  if (
    /Lines and Angles|Triangles|Trigonometry|Circle|Area|Volume|Geometry/i.test(
      title,
    )
  )
    return "Geometry and Trigonometry";
  if (/Algebra|Linear|Equations|Inequalities|Fractions/i.test(title))
    return "Algebra";
  return ""; // Do not invent domains for strategy chapters or unknown headings.
}
