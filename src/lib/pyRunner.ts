// Python-side helpers executed inside Pyodide. Kept in their own file (plain
// strings, no runtime imports) so they are easy to read and test.

/**
 * Cell runner (Jupyter/REPL-style):
 *  - prints repr() of a trailing bare expression, so `10 / 2` shows `5.0`
 *  - replaces input() with an *inline* version. Browsers can't block on a text
 *    field, so when input() is called and no answer is queued yet, the run is
 *    aborted (`__NeedInput`), the UI shows an input box, and the cell is
 *    re-run from the start with the collected answers replayed in order.
 *    Global bindings are restored between replays and `random` is re-seeded
 *    with the same seed, so a replay behaves exactly like the first attempt.
 *  - prints clean Python tracebacks (without the runner's own frames).
 *
 * Returns: None (finished) · "P:<prompt>" (needs input) · "E" (error printed to stderr)
 */
export const CELL_RUNNER_SETUP = `
import ast as __ast
import builtins as __builtins
import json as __json
import random as __random
import sys as __sys
import traceback as __traceback

class __NeedInput(BaseException):
    pass

__STATE = {}

def __restore(snap):
    g = globals()
    for k in list(g.keys()):
        if k not in snap:
            del g[k]
    g.update(snap)

def __run_cell(source, inputs_json, seed):
    g = globals()
    queue = list(__json.loads(inputs_json))
    if len(queue) == 0:
        __STATE["snap"] = dict(g)
    snap = __STATE.get("snap")
    __random.seed(seed)

    def _input(prompt=""):
        prompt = str(prompt)
        if queue:
            value = queue.pop(0)
            print(prompt + value)
            return value
        __STATE["prompt"] = prompt
        raise __NeedInput()

    orig_input = __builtins.input
    __builtins.input = _input
    try:
        tree = compile(source, "<cell>", "exec", flags=__ast.PyCF_ONLY_AST)
        if tree.body and isinstance(tree.body[-1], __ast.Expr):
            last_expr = tree.body.pop()
            if tree.body:
                exec(compile(__ast.Module(body=tree.body, type_ignores=[]), "<cell>", "exec"), g)
            result = eval(compile(__ast.Expression(body=last_expr.value), "<cell>", "eval"), g)
            if result is not None:
                print(repr(result))
        else:
            exec(compile(tree, "<cell>", "exec"), g)
        return None
    except __NeedInput:
        if snap is not None:
            __restore(snap)
        return "P:" + __STATE.get("prompt", "")
    except SystemExit:
        return None
    except BaseException as e:
        tb = e.__traceback__.tb_next if e.__traceback__ else None
        try:
            __sys.stdout.flush()
        except Exception:
            pass
        print("".join(__traceback.format_exception(type(e), e, tb)), file=__sys.stderr, end="")
        return "E"
    finally:
        __builtins.input = orig_input
        try:
            __sys.stdout.flush()
        except Exception:
            pass
`;

/**
 * Used for exercise tests: input() reads straight from the test's queued
 * input and does NOT print the prompt, so `input("Enter a number")` never
 * pollutes the program's output that gets compared with the expected output.
 */
export const TEST_INPUT_SETUP = `
def input(prompt=""):
    value = __next_input()
    if value is None:
        raise EOFError("EOF when reading a line")
    return value
`;
