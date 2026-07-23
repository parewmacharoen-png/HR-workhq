import { RequestFormFieldService } from './request-form-field.service';

describe('RequestFormFieldService UX-001 validation', () => {
  const svc = new RequestFormFieldService({} as never, {} as never, {} as never, {} as never);

  it('accepts button_select option values', () => {
    const err = svc.validateFieldValue({
      key: 'durationType',
      labelTh: 'รูปแบบ',
      fieldType: 'button_select',
      required: true,
      optionsJson: [{ label: 'เต็มวัน', value: 'full' }],
    }, 'full');
    expect(err).toBeNull();
  });

  it('rejects invalid quick_date', () => {
    const err = svc.validateFieldValue({
      key: 'startDate',
      labelTh: 'วันที่',
      fieldType: 'quick_date',
      required: true,
    }, 'not-a-date');
    expect(err).toContain('วัน/เดือน/ปี');
  });

  it('accepts dot-separated quick_time', () => {
    const err = svc.validateFieldValue({
      key: 'startTime',
      labelTh: 'เวลา',
      fieldType: 'quick_time',
      required: true,
    }, '21.00');
    expect(err).toBeNull();
  });

  it('rejects invalid quick_time', () => {
    const err = svc.validateFieldValue({
      key: 'startTime',
      labelTh: 'เวลา',
      fieldType: 'quick_time',
      required: true,
    }, '99:99');
    expect(err).toContain('21.00');
  });
});
