import { disallow } from 'feathers-hooks-common';
import { setClientAndJoiSchema, runJoiValidation } from '../../hooks/helper';
import validator from './usersBulkUpload.validationSchemas';
import runUserBulkUploadValidation from './usersBulkUpload.customHooks';

export default {
  before: {
    all: [
      // The following hooks were moved into middlewares
      // authenticate('jwt'),
      // roleAuthorizationHook(),
    ],
    create: [
      //
      setClientAndJoiSchema(),
      runJoiValidation(validator.create),
      runUserBulkUploadValidation(validator.csv),
    ],
    find: disallow(),
    get: disallow(),
    patch: disallow(),
    update: disallow(),
    remove: disallow(),
  },

  after: {
    all: [],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: [],
  },

  error: {
    all: [],
    find: [],
    get: [],
    create: [],
    update: [],
    patch: [],
    remove: [],
  },
};
