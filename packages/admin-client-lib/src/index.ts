import { AnonymousAuthenticationProvider } from "@microsoft/kiota-abstractions";
import { createAdminApiClient } from "./adminApiClient";
import { FetchRequestAdapter } from "@microsoft/kiota-http-fetchlibrary";

// TODO: add support for API key authentication
export function createAdminClient(baseUrl: string) {
    const authProvider = new AnonymousAuthenticationProvider();
    const adapter = new FetchRequestAdapter(authProvider);
    adapter.baseUrl = baseUrl;
    return createAdminApiClient(adapter);
}
