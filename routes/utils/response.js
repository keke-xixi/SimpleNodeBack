/** 统一接口响应格式 */
const success = (data, message = 'success') => ({
  code: 200,
  message,
  data,
});

const fail = (message, code = 400) => ({
  code,
  message,
});

const parseId = (value) => {
  const id = parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
};

module.exports = { success, fail, parseId };
