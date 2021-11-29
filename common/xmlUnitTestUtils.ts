const xmlFormatter = require("xml-formatter");
const XPATH = require("xpath");
const { DOMParser } = require("@xmldom/xmldom");

// This adds some handy xml-specific primitives for jest-expect.
// It was borrowed and expanded from lameta.

let resultXml: string;
let resultDom: Document;

export function setResultXml(xml: string) {
  resultXml = xml; /* ? */
  const parser = new DOMParser({
    errorHandler: {
      warning: (msg) => {
        console.warn("XML Parser Warning = " + msg);
      },
      error: (msg) => {
        console.error("XML Parser Error = " + msg);
        expect("xml parser error").toBe(msg);
        // throws don't seem to stop async tests
      },
      fatalError: (msg) => {
        console.error("XML Parser Fatal Error = " + msg);
        expect("xml parser error").toBe(msg);
        // throws don't seem to stop async tests
      },
    },
  });

  /* NOTE: we find this to be ridiculously tolerant of xml errors. Enhance: use a stricter parser */

  resultDom = parser.parseFromString(resultXml);

  //console.log(resultDom);
}

export function logTailResultXml(lastChars: number) {
  console.log(resultXml.slice(-lastChars));
}

export function assertAttribute(
  xpath: string,
  attribute: string,
  expected: string
) {
  const hits = select(xpath);
  if (!hits || hits.length === 0) {
    //console.log(resultXml);
    return {
      message: () => `expected ${xpath} to exist `,
      pass: false,
    };
  }
  const xpathWithAttr = xpath + `[@${attribute}="${expected}"]`;
  const pass = select(xpathWithAttr).length > 0;
  if (pass) {
    return {
      message: () => `expected ${xpath} ${attribute} to be '${expected}'. `,
      pass: true,
    };
  } else {
    return {
      message: () =>
        `expected ${xpath} ${attribute} to be '${expected}'. Hits: ${hits
          .map((node) => node.toString())
          .join(" ")}`,
      pass: false,
    };
  }
}

export function count(xpath: string): number {
  return select(xpath).length;
}
export function value(xpath: string): string {
  return select(xpath)[0].textContent;
}
export function select(xpath: string) {
  if (resultDom === undefined) {
    throw new Error(
      "resultDom was undefined in select(). Make sure you called setResultXml()"
    );
  }
  try {
    const nodes = XPATH.selectWithResolver(xpath, resultDom);
    return nodes;
  } catch (ex) {
    console.log("error in xpath: " + xpath);
    console.log(ex);
    throw new Error(`error in xpath: ${xpath} ${ex}`);
  }
}

// I haven't figured out to extend
// to novel names properly.
export const xexpect = expect as any;

// This overrides an existing expect function in order to have a convenient
// check using an xpath and an expected value.
expect.extend({
  toMatch(xpath: string, expectedValue: string | RegExp) {
    const hits = select(xpath);
    if (!hits || hits.length === 0) {
      //console.log(resultXml);
      return {
        message: () =>
          `expected ${xpath} to be '${expectedValue}' but it did not match anything`,
        pass: false,
      };
    }
    let pass;
    if (expectedValue instanceof RegExp)
      pass = value(xpath).match(expectedValue);
    else pass = value(xpath) === expectedValue;
    if (pass) {
      return {
        message: () => `expected ${xpath} to be '${expectedValue}'`,
        pass: true,
      };
    } else {
      //console.log(resultXml);
      return {
        message: () =>
          `expected ${xpath} to be '${expectedValue}'  but it was '${value(
            xpath
          )}'`,
        pass: false,
      };
    }
  },
});

expect.extend({
  toHaveCount(xpath, expectedValue) {
    const matchCount = select(xpath).length;
    if (matchCount !== expectedValue) {
      //      console.log(resultXml);
      return {
        message: () =>
          `got ${matchCount} instead ${expectedValue} matches for ${xpath}.
          ${xmlFormatter(resultXml)}`,
        pass: false,
      };
    }

    return {
      message: () => `expected ${xpath} to have ${expectedValue} matches`,
      pass: true,
    };
  },
});

expect.extend({
  toHaveAtLeast(xpath, expectedValue) {
    const matchCount = select(xpath).length;
    if (matchCount < expectedValue) {
      //      console.log(resultXml);
      return {
        message: () =>
          `expected >= ${expectedValue} matches, but got ${matchCount}
XPath: ${xpath}
${xmlFormatter(resultXml)}`,
        pass: false,
      };
    }

    return {
      message: () =>
        `expected ${xpath} to have at least ${expectedValue} matches`,
      pass: true,
    };
  },
});

expect.extend({
  toHaveAtMost(xpath, expectedValue) {
    const matchCount = select(xpath).length;
    if (matchCount > expectedValue) {
      return {
        message: () =>
          `expected ${xpath} to have at most ${expectedValue} matches, but got ${matchCount}`,
        pass: false,
      };
    }

    return {
      message: () =>
        `expected ${xpath} to have at most ${expectedValue} matches`,
      pass: true,
    };
  },
});

expect.extend({
  toDeclareVocabulary(xpath, url) {
    const hits = select(xpath);
    if (!hits || hits.length === 0) {
      //      console.log(resultXml);
      return {
        message: () =>
          `expected ${xpath} to be '${url}' but it did not match anything`,
        pass: false,
      };
    }
    const xpathWithAttr = xpath + `[@Link="${url}"]`;
    const pass = select(xpathWithAttr).length > 0;
    if (pass) {
      return {
        message: () => `expected ${xpathWithAttr} Link to be '${url}'`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${xpathWithAttr} Link to be '${url}'`,
        pass: false,
      };
    }
  },
});

expect.extend({
  toBeClosed(xpath) {
    const hits = select(xpath);
    if (!hits || hits.length === 0) {
      //      console.log(resultXml);
      return {
        message: () => `expected ${xpath} to be exist`,
        pass: false,
      };
    }
    const xpathWithAttr = xpath + `[@Type="ClosedVocabulary"]`;
    const pass = select(xpathWithAttr).length > 0;
    if (pass) {
      return {
        message: () => `expected ${xpathWithAttr} type to be closed}'`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${xpathWithAttr} Link to be type to be closed. `,
        pass: false,
      };
    }
  },
});

expect.extend({
  toBeOpen(xpath) {
    return assertAttribute(xpath, "Type", "OpenVocabulary");
  },
});
expect.extend({
  toBeOpenList(xpath) {
    return assertAttribute(xpath, "Type", "OpenVocabularyList");
  },
});
expect.extend({
  toHaveAttributeValue(xpath, attributeName, attributeValue) {
    return assertAttribute(xpath, attributeName, attributeValue);
  },
});
expect.extend({
  toHaveText(xpath, text) {
    if (value(xpath) === text) {
      return {
        message: () => "",
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${xpath}, which is "${value(xpath)}", to equal "${text}".`,
        pass: false,
      };
    }
  },
});

// use with xpath like //foo/@count
expect.extend({
  toBeIntGreaterThan(xpath, expected) {
    if (select(xpath).length === 0) {
      return {
        message: () => `No matches for ${xpath}.
        ${xmlFormatter(resultXml)}`,
        pass: false,
      };
    }
    if (select(xpath).length > 1) {
      return {
        message: () => `Multiple matches for ${xpath}.
        ${xmlFormatter(resultXml)}`,
        pass: false,
      };
    }
    const n = parseInt(value(xpath));
    if (expected < n) {
      return {
        message: () => `${n} >= ${expected}`,
        pass: true,
      };
    } else {
      return {
        message: () => `${n} < ${expected} for ${xpath}.
        ${xmlFormatter(resultXml)}`,
        pass: false,
      };
    }
  },
});
expect.extend({
  toContainText(xpath, text) {
    if (value(xpath).indexOf(text) > -1) {
      return {
        message: () => "",
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${xpath}, which is "${value(
            xpath
          )}", to contain "${text}".`,
        pass: false,
      };
    }
  },
});

expect.extend({
  toBeAComment() {
    if (resultXml && resultXml.startsWith("<!--")) {
      return {
        message: () => "",
        pass: true,
      };
    } else {
      return {
        message: () => `expected only a comment
                ${xmlFormatter(resultXml)}`,
        pass: false,
      };
    }
  },
});
