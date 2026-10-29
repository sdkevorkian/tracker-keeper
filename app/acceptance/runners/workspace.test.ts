// Runs the acceptance cases against the Workspace, in-process, under Vitest.
import { cases } from '../cases/index.ts'
import { vitestAcceptanceTest } from './vitest.ts'
import { WorkspaceDriver } from '../drivers/workspace.ts'

const test = vitestAcceptanceTest(() => new WorkspaceDriver())
for (const register of cases) register(test)
