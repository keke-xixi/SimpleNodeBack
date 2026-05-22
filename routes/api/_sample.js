/**
 * 【示例】新增业务接口：复制本文件为 routes/api/xxx.js（不要下划线开头）
 * 自动挂载路径：/api/xxx
 *
 * const express = require('express');
 * const pool = require('../../db/pool');
 * const { dbErrorMessage } = require('../../db/error');
 * const { success, fail, parseId } = require('../utils/response');
 *
 * const router = express.Router();
 *
 * router.get('/', async (req, res) => {
 *   try {
 *     res.json(success({ hello: 'world' }));
 *   } catch (err) {
 *     console.error(err);
 *     res.status(500).json(fail(dbErrorMessage(err), 500));
 *   }
 * });
 *
 * module.exports = router;
 */
