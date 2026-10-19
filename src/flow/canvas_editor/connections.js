/**
 * THE CANVAS EDITOR'S CONNECTION RULES under a host's `connections` option —
 * PURE: no DOM, runs under plain node.
 *
 *     const verdictOf = connectionRules({catalogue, policy, strings});
 *     verdictOf(graph, {source, sourcePort, target, targetPort});
 *     // → {ok: true} | {ok: true, offer} | {ok: false, reason}
 *
 * Asked in this order, the first refusal winning:
 *
 *   1. what the canvas cannot draw — `canConnect` with `dataPorts` as the
 *      option says: a missing end or port, a step to itself, a flow port to a
 *      data port, the same line twice, a second line out of a one-line flow port
 *   2. the kernel's `ConnectorRouter`, over the catalogue's port descriptors: a
 *      `disabled` port (its `disabledReason`), a port at its `maxConnections`
 *      (or `allowMultiple: false`)
 *   3. the port types: an input that `accepts` a list refuses an output whose
 *      `provides` names none of it (either list absent is untyped)
 *   4. the host's `policy(ctx)`: the router's context plus `connection` (the
 *      line asked about) and `graph` (a copy). It may refuse, allow, or answer
 *      `{ok: true, offer}`
 *
 * Each refusal is a sentence the editor puts on the screen.
 */

import { NodePlatform } from '../../canvas/graph/node_platform.js';
import { ConnectorRouter, CONNECTOR_STRINGS } from '../../canvas/graph/connector_router.js';
import { canConnect, normalise } from '../kit/logic_graph.js';
import { say } from '../kit/strings.js';

/** A port's id in the kernel: a step may have an input and an output of one name. */
const portId = (direction, name) => `${direction}:${name}`;
const typeList = (v) => (Array.isArray(v) && v.length ? v.map(String) : null);

/**
 * @param {object} o
 * @param {object} o.catalogue                 a step catalogue
 * @param {(ctx: object) => object|null} [o.policy]  the host's rules, asked last
 * @param {boolean} [o.dataPorts]              do data ports connect
 * @param {object} o.strings                   the editor's words (`createStrings`)
 */
export function connectionRules({ catalogue, policy = null, dataPorts = false, strings }) {
    const S = strings;
    const nameOf = (n) => n?.label || catalogue.get(n?.type)?.label || n?.type || '';
    let asked = null;

    const typed = (ctx) => {
        const accepts = typeList(ctx.toPort.accepts);
        const provides = typeList(ctx.fromPort.provides);
        if (!accepts || !provides || provides.some((x) => accepts.includes(x))) return null;
        return {
            ok: false,
            reason: say(S, 'connectTypes', {
                from: ctx.fromPort.label || ctx.fromPort.name, fromStep: nameOf(ctx.fromNode),
                to: ctx.toPort.label || ctx.toPort.name, toStep: nameOf(ctx.toNode), accepts, provides,
            }),
        };
    };
    const platform = new NodePlatform();
    const router = new ConnectorRouter({
        platform,
        // The generic refusals in the host's words, when its `strings` has them.
        strings: Object.fromEntries(Object.keys(CONNECTOR_STRINGS).filter((k) => S[k] !== undefined)
            .map((k) => [k, S[k]])),
        policy: (ctx) => typed(ctx) || (typeof policy === 'function'
            ? policy({ ...ctx, connection: { ...asked.connection }, graph: normalise(asked.graph) }) : null),
    });

    return function verdictOf(graph, edge) {
        const first = canConnect(graph, catalogue, edge, { strings: S, dataPorts });
        if (!first.ok) return first;
        platform.hydrate(graph.nodes.map((n) => ({
            ...n,
            ports: (catalogue.get(n.type)?.ports || []).map((p) => ({ ...p, id: portId(p.direction, p.name) })),
        })));
        router.hydrate(graph.connections.map((c, i) => ({
            id: i, from: c.source, to: c.target,
            fromPort: portId('output', c.sourcePort), toPort: portId('input', c.targetPort),
        })));
        asked = { connection: edge, graph };
        try {
            const v = router.canConnect({ nodeId: edge.source, portId: portId('output', edge.sourcePort) },
                                        { nodeId: edge.target, portId: portId('input', edge.targetPort) });
            if (!v || v.ok === false) return { ok: false, reason: String(v?.reason || say(S, 'connectRefused')) };
            return v.offer ? { ok: true, offer: v.offer } : { ok: true };
        } finally {
            asked = null;
        }
    };
}
