import App from "../system/App";

/**
 * The full 25-screen prototype on the in-repo dataset — kept reachable at
 * /demo while the production shell (Entra + API) owns the root route.
 */
export default function Demo() { return <App forceDemo />; }
