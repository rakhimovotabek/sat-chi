// Official SAT reference content: College Board SAT Practice Test 6, page 30.
// Diagrams are original vector geometry; no College Board branding/assets copied.
const diagrams = {
  circle: (
    <>
      <circle cx="70" cy="38" r="28" />
      <path d="M70 38h28" />
      <text x="80" y="33">
        r
      </text>
    </>
  ),
  rectangle: (
    <>
      <path d="M30 15h80v48H30z" />
      <text x="66" y="12">
        l
      </text>
      <text x="116" y="43">
        w
      </text>
    </>
  ),
  triangle: (
    <>
      <path d="M20 65l55-55 45 55zM75 10v55" />
      <text x="79" y="45">
        h
      </text>
      <text x="67" y="74">
        b
      </text>
    </>
  ),
  right: (
    <>
      <path d="M30 10v55h80zM30 55h10v10" />
      <text x="17" y="40">
        a
      </text>
      <text x="65" y="74">
        b
      </text>
      <text x="76" y="33">
        c
      </text>
    </>
  ),
  special45: (
    <>
      <path d="M30 10v55h55z" />
      <text x="14" y="45">
        s
      </text>
      <text x="53" y="74">
        s
      </text>
      <text x="66" y="29">
        s√2
      </text>
      <text x="36" y="39">
        45°
      </text>
      <text x="47" y="61">
        45°
      </text>
    </>
  ),
  special30: (
    <>
      <path d="M28 10v55h87z" />
      <text x="12" y="44">
        x
      </text>
      <text x="61" y="74">
        x√3
      </text>
      <text x="73" y="29">
        2x
      </text>
      <text x="62" y="61">
        30°
      </text>
      <text x="35" y="37">
        60°
      </text>
    </>
  ),
  prism: (
    <>
      <path d="M30 30h64v35H30zM30 30l18-17h64v35L94 65M94 30l18-17M112 48H48V13" />
      <text x="63" y="74">
        l
      </text>
      <text x="116" y="40">
        h
      </text>
      <text x="102" y="66">
        w
      </text>
    </>
  ),
  cylinder: (
    <>
      <ellipse cx="70" cy="15" rx="30" ry="9" />
      <path d="M40 15v45a30 9 0 0060 0V15M70 15h30" />
      <ellipse cx="70" cy="60" rx="30" ry="9" />
      <text x="82" y="13">
        r
      </text>
      <text x="106" y="44">
        h
      </text>
    </>
  ),
  sphere: (
    <>
      <circle cx="70" cy="38" r="30" />
      <ellipse cx="70" cy="38" rx="30" ry="10" />
      <path d="M70 38h30" />
      <text x="82" y="34">
        r
      </text>
    </>
  ),
  cone: (
    <>
      <ellipse cx="70" cy="63" rx="32" ry="8" />
      <path d="M38 63L70 7l32 56M70 7v56h32" />
      <text x="74" y="35">
        h
      </text>
      <text x="83" y="62">
        r
      </text>
    </>
  ),
  pyramid: (
    <>
      <path d="M25 56l55-45 35 45-45 15zM80 11L70 71M25 56h90M80 11v51" />
      <text x="83" y="43">
        h
      </text>
      <text x="42" y="72">
        l
      </text>
      <text x="96" y="72">
        w
      </text>
    </>
  ),
};
const formulas = [
  ["circle", "Circle", ["A = πr²", "C = 2πr"]],
  ["rectangle", "Rectangle", ["A = lw"]],
  ["triangle", "Triangle", ["A = ½bh"]],
  ["right", "Right triangle", ["c² = a² + b²"]],
  ["special45", "Special right triangle", ["45°–45°–90°"]],
  ["special30", "Special right triangle", ["30°–60°–90°"]],
  ["prism", "Rectangular prism", ["V = lwh"]],
  ["cylinder", "Cylinder", ["V = πr²h"]],
  ["sphere", "Sphere", ["V = ⁴⁄₃πr³"]],
  ["cone", "Cone", ["V = ⅓πr²h"]],
  ["pyramid", "Rectangular pyramid", ["V = ⅓lwh"]],
];
export default function MathReference() {
  return (
    <div className="math-reference">
      <h3>SAT Math reference</h3>
      <div className="reference-formulas">
        {formulas.map(([key, label, values]) => (
          <article key={key}>
            <svg viewBox="0 0 140 80" role="img" aria-label={label}>
              {diagrams[key]}
            </svg>
            {values.map((v) => (
              <p key={v}>{v}</p>
            ))}
          </article>
        ))}
      </div>
      <div className="reference-notes">
        <p>A complete circle measures 360 degrees, or 2π radians.</p>
        <p>The interior angles of a triangle total 180 degrees.</p>
      </div>
      <a
        href="https://satsuite.collegeboard.org/media/pdf/sat-practice-test-6-digital.pdf"
        target="_blank"
        rel="noreferrer"
      >
        Reference: College Board SAT practice test · printed page 30
      </a>
    </div>
  );
}
