import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  automationConditionOperatorLabels,
  automationConditionOperators,
  automationEventFields,
  listValueOperators,
  noValueOperators,
} from '@/features/automation/automationFields'
import type { AutomationCondition, AutomationConditionOperator, AutomationEventType } from '@/types/database'

import { ListEditor } from './ListEditor'

const CUSTOM_FIELD = '__custom__'

function ConditionRow({
  condition,
  update,
  eventType,
}: {
  condition: AutomationCondition
  update: (patch: Partial<AutomationCondition>) => void
  eventType: AutomationEventType | string
}) {
  const knownFields = automationEventFields[eventType as AutomationEventType] ?? []
  const isKnown = knownFields.some((f) => f.path === condition.field)
  const isCustom = condition.field !== '' && !isKnown

  const showValue = !noValueOperators.includes(condition.operator)
  const isList = listValueOperators.includes(condition.operator)

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr]">
      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Field</Label>
        <Select
          value={isCustom ? CUSTOM_FIELD : condition.field || undefined}
          onValueChange={(v) => update({ field: v === CUSTOM_FIELD ? '' : v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Choose a field" />
          </SelectTrigger>
          <SelectContent>
            {knownFields.map((f) => (
              <SelectItem key={f.path} value={f.path}>
                {f.label}
              </SelectItem>
            ))}
            <SelectItem value={CUSTOM_FIELD}>Custom field path…</SelectItem>
          </SelectContent>
        </Select>
        {isCustom && (
          <Input
            className="mt-1"
            placeholder="e.g. order.total_value"
            value={condition.field}
            onChange={(e) => update({ field: e.target.value })}
          />
        )}
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Operator</Label>
        <Select
          value={condition.operator}
          onValueChange={(v) => update({ operator: v as AutomationConditionOperator, value: noValueOperators.includes(v as AutomationConditionOperator) ? null : condition.value })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {automationConditionOperators.map((op) => (
              <SelectItem key={op} value={op}>
                {automationConditionOperatorLabels[op]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs text-muted-foreground">Value</Label>
        {showValue ? (
          isList ? (
            <Input
              placeholder="value1, value2, value3"
              value={Array.isArray(condition.value) ? condition.value.join(', ') : ''}
              onChange={(e) =>
                update({
                  value: e.target.value
                    .split(',')
                    .map((v) => v.trim())
                    .filter(Boolean),
                })
              }
            />
          ) : (
            <Input
              placeholder="Value to compare"
              value={condition.value === null || condition.value === undefined ? '' : String(condition.value)}
              onChange={(e) => {
                const raw = e.target.value
                const numeric = ['greater_than', 'less_than', 'greater_or_equal', 'less_or_equal'].includes(condition.operator)
                update({ value: numeric && raw !== '' && !Number.isNaN(Number(raw)) ? Number(raw) : raw })
              }}
            />
          )
        ) : (
          <div className="flex h-9 items-center text-xs text-muted-foreground">No value needed</div>
        )}
      </div>
    </div>
  )
}

export function RuleConditionsEditor({
  conditions,
  onChange,
  eventType,
}: {
  conditions: AutomationCondition[]
  onChange: (conditions: AutomationCondition[]) => void
  eventType: AutomationEventType | string
}) {
  return (
    <ListEditor<AutomationCondition>
      items={conditions}
      onChange={onChange}
      newItem={{ field: '', operator: 'equals', value: '' }}
      addLabel="Add condition"
      emptyLabel="No conditions — the rule runs on every occurrence of this event."
      renderItem={(condition, update) => <ConditionRow condition={condition} update={update} eventType={eventType} />}
    />
  )
}
