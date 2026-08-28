// ── STRIPPING COMMENTS SO PROSE CANNOT ANSWER A STRUCTURAL QUESTION ─────────
//
// A dozen guard tests in this repo ask "does this file DO x", and every one of
// them has to remove comments first, or the sentence explaining why we do NOT
// do x satisfies the grep looking for x. Each had written its own two-line
// version:
//
//     src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
//
// THAT VERSION IS WRONG, and was silently wrong for months. It strips BLOCK
// comments first, so a `/*` appearing inside a LINE comment opens a block that
// runs to the next `*/` anywhere below — swallowing every line between.
//
// It is not a hypothetical. src/app/auth/callback/route.ts line 147 reads:
//
//     // under /student/* while onboarding_completed is false), not on a
//
// The `/student/*` in that sentence opened a comment that closed at the next
// JSDoc `*/` seventy lines later. 3,457 of the file's 11,170 characters —
// including the `if (isNewUser)` branch — simply did not exist as far as any
// guard was concerned. A guard that cannot see the code it is asserting about
// does not fail; it PASSES, which is the worst way for a test to be wrong.
//
// Eight files in this repo currently have a `/*` inside a line comment. Route
// paths and glob patterns in prose are the normal way to acquire one, so this
// will keep happening and no amount of care in comments will prevent it.
//
// So this is a scanner, not a pair of regexes. It walks the source once,
// tracking whether it is inside a string, a template literal, a regex literal,
// a line comment or a block comment, and only removes the last two. Order
// stops mattering because there is no second pass.
//
// Newlines are preserved so a caller can still reason about line positions.
//
// TEMPLATE LITERALS NEST, and a scanner that forgets it is worse than useless.
// `${rows.map((r) => `<tr>…`)}` puts a whole template inside a substitution
// inside a template. Treating templates as flat makes the inner opening
// backtick read as the OUTER one's close, and from there every quote is
// inverted: real code is skipped as if it were a string, and comments below it
// are emitted as if they were code. push-recovery/route.ts does exactly this,
// and a flat scanner leaks its comments into the output — which is how a guard
// asserting "this route contains no .in('id', …)" fails on a COMMENT that says
// the route used to. So substitutions are a stack, not a boolean.

type Delim = 'single' | 'double' | 'template' | 'regex';

export function codeOnly(src: string): string {
  let out = '';
  let i = 0;

  // What we are inside, innermost last. A 'template' frame means a backtick is
  // open; a 'sub' frame means we are in `${…}` and are reading real code again,
  // counting braces so the substitution's own object literals do not close it.
  type Frame = { kind: 'template' } | { kind: 'sub'; braces: number };
  const stack: Frame[] = [];
  let delim: Delim | null = null;   // set while inside a quoted run

  const startsRegex = (): boolean => {
    for (let k = out.length - 1; k >= 0; k--) {
      const c = out[k];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') continue;
      return !/[A-Za-z0-9_$)\].]/.test(c);
    }
    return true;
  };

  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];

    // ── inside a quoted run ────────────────────────────────────────────────
    if (delim) {
      if (c === '\\') { out += c; if (i + 1 < src.length) out += src[i + 1]; i += 2; continue; }
      if (delim === 'template' && c === '$' && n === '{') {
        // Back to real code until the matching brace.
        out += '${'; stack.push({ kind: 'sub', braces: 0 }); delim = null; i += 2; continue;
      }
      out += c;
      const closer = delim === 'single' ? "'" : delim === 'double' ? '"' : delim === 'template' ? '`' : '/';
      if (c === closer) {
        if (delim === 'template') stack.pop();
        delim = null;
      } else if (c === '\n' && delim !== 'template') {
        // An unterminated quote or regex cannot run past its own line, so a
        // stray apostrophe in odd source cannot swallow the rest of the file.
        delim = null;
      }
      i++; continue;
    }

    // ── real code (possibly inside a `${…}`) ───────────────────────────────
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && n === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') out += '\n'; i++; }
      i += 2; continue;
    }

    if (c === '{' && stack.length && stack[stack.length - 1].kind === 'sub') {
      (stack[stack.length - 1] as { kind: 'sub'; braces: number }).braces++;
    } else if (c === '}' && stack.length && stack[stack.length - 1].kind === 'sub') {
      const top = stack[stack.length - 1] as { kind: 'sub'; braces: number };
      if (top.braces === 0) { out += c; stack.pop(); delim = 'template'; i++; continue; }
      top.braces--;
    }

    if (c === "'") delim = 'single';
    else if (c === '"') delim = 'double';
    else if (c === '`') { delim = 'template'; stack.push({ kind: 'template' }); }
    else if (c === '/' && startsRegex()) delim = 'regex';

    out += c; i++;
  }
  return out;
}
