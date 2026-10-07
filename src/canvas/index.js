/**
 * What `@flexdesk/canvas` exports — the canvas kernel (36 §4).
 *
 * OWNED BY the canvas agent (B, 36 §2): the base layer (`CanvasAdapter`) and
 * the edge router, moved with their behaviour intact, and the GENERIC graph
 * layer (`NodePlatform`, `ConnectorRouter`, `HistoryService`) that a
 * consumer's own rules subclass. Nothing here knows what a node is.
 */

export { CanvasAdapter } from './canvas_adapter.js';
export {
    OBSTACLE_ROUTING_NODE_LIMIT, routeEdge, footAnchor, crowsFoot, cardinality, selfLoop, returnEdge, arrange,
} from './edge_router.js';
export { NodePlatform } from './graph/node_platform.js';
export { ConnectorRouter, CONNECTOR_STRINGS } from './graph/connector_router.js';
export { HistoryService } from './graph/history_service.js';
