import { type KnowledgeEntry, loadKnowledgeEntriesFromDirectory } from "./knowledge.ts";

export const PRIVATE_KNOWLEDGE_DIRECTORY_ENV = "SUPPORT_AGENT_PRIVATE_KNOWLEDGE_DIR";

export function privateKnowledgeDirectoryFromEnvironment(environment: NodeJS.ProcessEnv): string | undefined {
	const directory = environment[PRIVATE_KNOWLEDGE_DIRECTORY_ENV]?.trim();
	return directory || undefined;
}

export function loadPrivateKnowledgeCorpus(environment: NodeJS.ProcessEnv = process.env): KnowledgeEntry[] {
	const directory = privateKnowledgeDirectoryFromEnvironment(environment);
	if (!directory)
		throw new Error(`${PRIVATE_KNOWLEDGE_DIRECTORY_ENV} is required to load a private knowledge corpus.`);
	return loadKnowledgeEntriesFromDirectory(directory);
}
