import { applyUnitScope, UNIT_SCOPED_MODELS, type UnitScopeContext } from './unit-scope.extension';

const ctxA: UnitScopeContext = { unitId: 'unit_A', skip: false };
const ctxSkip: UnitScopeContext = { unitId: 'unit_A', skip: true };
const ctxAnonymous: UnitScopeContext = { unitId: undefined, skip: false };

describe('applyUnitScope', () => {
  beforeEach(() => UNIT_SCOPED_MODELS.clear());

  it('é no-op para modelos não registrados', () => {
    const out = applyUnitScope('Foo', 'findMany', { where: { x: 1 } }, ctxA);
    expect(out).toEqual({ where: { x: 1 } });
  });

  it('injeta where.unitId em reads de modelo escopado', () => {
    UNIT_SCOPED_MODELS.add('Service');
    expect(applyUnitScope('Service', 'findMany', { where: { name: 'X' } }, ctxA)).toEqual({
      where: { name: 'X', unitId: 'unit_A' },
    });
    expect(applyUnitScope('Service', 'count', undefined, ctxA)).toEqual({
      where: { unitId: 'unit_A' },
    });
    expect(applyUnitScope('Service', 'findFirst', {}, ctxA)).toEqual({
      where: { unitId: 'unit_A' },
    });
  });

  it('injeta where.unitId em update/delete/upsert', () => {
    UNIT_SCOPED_MODELS.add('Service');
    expect(
      applyUnitScope('Service', 'updateMany', { where: { name: 'X' }, data: { n: 1 } }, ctxA),
    ).toEqual({ where: { name: 'X', unitId: 'unit_A' }, data: { n: 1 } });
  });

  it('injeta data.unitId em create quando ausente', () => {
    UNIT_SCOPED_MODELS.add('Service');
    const args = { data: { name: 'Fisio' } };
    applyUnitScope('Service', 'create', args, ctxA);
    expect(args.data).toEqual({ name: 'Fisio', unitId: 'unit_A' });
  });

  it('valida data.unitId quando presente — aceita match', () => {
    UNIT_SCOPED_MODELS.add('Service');
    const args = { data: { name: 'X', unitId: 'unit_A' } };
    expect(() => applyUnitScope('Service', 'create', args, ctxA)).not.toThrow();
  });

  it('rejeita create cross-tenant', () => {
    UNIT_SCOPED_MODELS.add('Service');
    expect(() =>
      applyUnitScope('Service', 'create', { data: { name: 'X', unitId: 'unit_B' } }, ctxA),
    ).toThrow(/unit-scope.*unit_B.*unit_A/);
  });

  it('valida cada linha em createMany', () => {
    UNIT_SCOPED_MODELS.add('Service');
    const args = { data: [{ name: 'X' }, { name: 'Y' }] };
    applyUnitScope('Service', 'createMany', args, ctxA);
    expect(args.data).toEqual([
      { name: 'X', unitId: 'unit_A' },
      { name: 'Y', unitId: 'unit_A' },
    ]);
  });

  it('é no-op quando skip=true', () => {
    UNIT_SCOPED_MODELS.add('Service');
    expect(applyUnitScope('Service', 'findMany', { where: {} }, ctxSkip)).toEqual({
      where: {},
    });
  });

  it('é no-op quando não há contexto de unidade (seed/job)', () => {
    UNIT_SCOPED_MODELS.add('Service');
    expect(applyUnitScope('Service', 'findMany', { where: {} }, ctxAnonymous)).toEqual({
      where: {},
    });
  });
});
