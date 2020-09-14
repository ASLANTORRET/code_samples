import { object as JoiObject, array as JoiArray, forbidden } from '@hapi/joi';
import { JoiObjectId, JoiOptions } from '../validatorSchemas';

const createSchema = JoiObject().keys({
  data: {
    csvUsers: JoiArray().required(),
    group: JoiObjectId.optional(),
  },
});

const csvUserSchema = JoiObject().keys({
  roleName: forbidden(),
});

export default {
  create: { schema: createSchema, options: JoiOptions },
  csv: { schema: csvUserSchema, options: { ...JoiOptions, convert: true } },
};
