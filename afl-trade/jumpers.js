// Simplified home-guernsey motifs for all 18 clubs, drawn inside a circle (no logos).
// Jumpers.svg(code, size) -> '<svg ...>' string. Jumpers.dataUrl(code) for canvas drawing.
(function (root) {
  const vstripes = (colours, widths) => {
    let x = 0, out = '';
    colours.forEach((c, i) => { out += `<rect x="${x}" y="0" width="${widths[i] + 0.3}" height="100" fill="${c}"/>`; x += widths[i]; });
    return out;
  };
  const hoops = (colours, y0, h) => colours.map((c, i) => `<rect x="0" y="${y0 + i * h}" width="100" height="${h + 0.3}" fill="${c}"/>`).join('');
  const chevron = (topY, tipY, w, fill) => `<polygon points="0,${topY} 50,${tipY} 100,${topY} 100,${topY + w} 50,${tipY + w} 0,${topY + w}" fill="${fill}"/>`;
  const sash = (fill) => `<polygon points="62,-5 100,-5 100,8 30,105 -5,105 -5,92" fill="${fill}"/>`;

  const D = {
    ADE: () => `<rect width="100" height="100" fill="#002B5C"/>` + hoops(['#E21937', '#FFD200', '#002B5C', '#E21937', '#FFD200', '#002B5C', '#E21937', '#FFD200'], 42, 7.5),
    BRL: () => `<rect width="100" height="100" fill="#7A184A"/><rect width="100" height="40" fill="#0054A4"/><rect y="39" width="100" height="3" fill="#FDBE57"/><polyline points="40,0 50,24 60,0" fill="none" stroke="#FDBE57" stroke-width="3"/>`,
    CAR: () => `<rect width="100" height="100" fill="#031A29"/><path d="M30 0 Q50 30 70 0" fill="none" stroke="#fff" stroke-width="4"/>`,
    COL: () => vstripes(['#000', '#fff', '#000', '#fff', '#000', '#fff', '#000'], [10, 16, 16, 16, 16, 16, 10]) + `<polygon points="38,0 62,0 50,24" fill="#000"/>`,
    ESS: () => `<rect width="100" height="100" fill="#000"/>` + sash('#CC2031'),
    FRE: () => `<rect width="100" height="100" fill="#2A0D54"/>` + chevron(-2, 20, 9, '#fff') + chevron(14, 38, 9, '#fff') + chevron(30, 56, 9, '#fff'),
    GEE: () => hoops(['#fff', '#1C3C63', '#fff', '#1C3C63', '#fff', '#1C3C63', '#fff', '#1C3C63', '#fff', '#1C3C63'], 0, 10),
    GCS: () => `<rect width="100" height="100" fill="#E11B0A"/><circle cx="50" cy="58" r="22" fill="none" stroke="#FFDB60" stroke-width="5"/><circle cx="50" cy="58" r="12" fill="#A80000"/>`,
    GWS: () => `<rect width="100" height="100" fill="#343433"/><rect width="100" height="42" fill="#F15C22"/><path d="M68 56 A18 18 0 1 0 68 84 L68 71 L55 71" fill="none" stroke="#fff" stroke-width="6" stroke-linejoin="round"/>`,
    HAW: () => vstripes(['#FBBF15', '#4D2004', '#FBBF15', '#4D2004', '#FBBF15', '#4D2004', '#FBBF15'], [15.5, 12, 15.5, 14, 15.5, 12, 15.5]),
    MEL: () => `<rect width="100" height="100" fill="#0F1131"/><polygon points="0,0 100,0 100,23 50,48 0,23" fill="#CC2031"/>`,
    NTH: () => vstripes(['#fff', '#013B9F', '#fff', '#013B9F', '#fff', '#013B9F', '#fff'], [8, 16, 16, 20, 16, 16, 8]) + `<polygon points="40,0 60,0 50,20" fill="#fff"/>`,
    PTA: () => `<rect width="100" height="100" fill="#000"/>` + chevron(8, 52, 11, '#fff') + chevron(-2, 40, 10, '#008AAB') + `<polygon points="30,-2 50,30 70,-2" fill="#000"/>`,
    RIC: () => `<rect width="100" height="100" fill="#000"/>` + sash('#FED102'),
    STK: () => vstripes(['#ED0F05', '#fff', '#000'], [35, 27, 38]),
    SYD: () => `<rect width="100" height="100" fill="#fff"/><path d="M0 0 H100 V34 Q88 36 76 48 Q66 38 54 42 L50 36 L46 42 Q34 38 24 48 Q12 36 0 34 Z" fill="#E1251B"/>`,
    WCE: () => `<rect width="100" height="100" fill="#003087"/><path d="M0 0 H40 V45 L22 70 Q10 56 0 58 Z" fill="#F2A900"/><path d="M100 0 H60 V45 L78 70 Q90 56 100 58 Z" fill="#F2A900"/>`,
    WBD: () => `<rect width="100" height="100" fill="#014896"/><rect y="53" width="100" height="9" fill="#E21937"/><rect y="66" width="100" height="9" fill="#fff"/>`,
  };

  let uid = 0;
  const svg = (code, size = 40, ring = 'rgba(255,255,255,.9)') => {
    const id = `jc${++uid}`;
    const body = (Object.hasOwn(D, code) ? D[code] : () => '<rect width="100" height="100" fill="#666"/>')();
    return `<svg class="jumper" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true"><defs><clipPath id="${id}"><circle cx="50" cy="50" r="48"/></clipPath></defs><g clip-path="url(#${id})">${body}</g><circle cx="50" cy="50" r="48" fill="none" stroke="${ring}" stroke-width="3"/></svg>`;
  };
  const dataUrl = (code, ring) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg(code, 200, ring).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '));

  root.Jumpers = { svg, dataUrl };
})(window);
