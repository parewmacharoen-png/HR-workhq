#!/usr/bin/env bash
# WorkHQ Phase 2 HR OS consistency check
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
FAIL=0

ok() { echo "OK: $1"; }
fail() { echo "FAIL: $1"; FAIL=1; }

[ -f "prisma/migrations/20260624150000_workhq_phase2_hr_os/migration.sql" ] && ok "Phase 2 migration exists" || fail "Phase 2 migration exists"
[ -f "backend/src/modules/request/interface/http/workflow-builder.controller.ts" ] && ok "Workflow builder controller" || fail "Workflow builder controller"
[ -f "backend/src/modules/formula-engine/formula-engine.module.ts" ] && ok "Formula engine module" || fail "Formula engine module"
[ -f "backend/src/modules/request/application/approval-flow-builder.service.ts" ] && ok "Approval flow builder" || fail "Approval flow builder"
[ -f "backend/src/modules/ai/application/ai-manager.service.ts" ] && ok "AI Manager service" || fail "AI Manager service"
[ -f "backend/src/modules/ai/application/knowledge-graph.service.ts" ] && ok "Knowledge graph service" || fail "Knowledge graph service"
[ -f "backend/src/modules/competency/competency.module.ts" ] && ok "Competency module" || fail "Competency module"
[ -f "backend/src/modules/succession/succession.module.ts" ] && ok "Succession module" || fail "Succession module"
[ -f "backend/src/shared/formula/safe-formula.evaluator.unit.spec.ts" ] && ok "Safe formula evaluator tests" || fail "Safe formula evaluator tests"
[ -f "web/src/pages/admin/WorkflowsPage.tsx" ] && ok "Web workflows page" || fail "Web workflows page"
[ -f "web/src/pages/admin/FormulasPage.tsx" ] && ok "Web formulas page" || fail "Web formulas page"
[ -f "web/src/pages/ai/AiManagerPage.tsx" ] && ok "Web AI manager page" || fail "Web AI manager page"
[ -f "web/src/pages/ai/KnowledgeGraphPage.tsx" ] && ok "Web knowledge graph page" || fail "Web knowledge graph page"
[ -f "web/src/pages/hr/CompetenciesPage.tsx" ] && ok "Web competencies page" || fail "Web competencies page"
[ -f "web/src/pages/hr/SuccessionPage.tsx" ] && ok "Web succession page" || fail "Web succession page"

cd backend && npx prisma validate --schema ../prisma/schema.prisma >/dev/null 2>&1 && ok "Prisma schema valid" || fail "Prisma schema valid"
cd "$ROOT"

if rg -q "finance.*P&L|revenue tracking|accounting module" backend/src/modules/formula-engine backend/src/modules/ai/application/knowledge-graph.service.ts 2>/dev/null; then
  fail "HR-only scope (no finance formulas in phase2 modules)"
else
  ok "HR-only scope (no finance formulas in phase2 modules)"
fi

if [ "$FAIL" -ne 0 ]; then
  echo "Phase 2 consistency check FAILED"
  exit 1
fi
echo "Phase 2 consistency check PASSED"
