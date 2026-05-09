const express = require('express');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3009;

app.use(express.json());
app.use(cors());
app.options('*', cors());


const success_response = (data, message = 'success') => {
  return {
    code: 200,    
    message,
    data
  };
}

app.get('/api/menu', (req, res) => {
  const { menuName } = req.query;
  let data = [
      { label: '首页', key: 'home' }, // key 是必须的
      { label: '报表', key: 'report' },
      {
          label: '系统设置',
          key: 'system',
          children: [ { label: '系统参数', key: 'system-params' } ], // 子菜单也在这里
      },
      { label: '工具', key: 'tool' },
  ]
  if (menuName) {
    data = data.filter(item => item.label.includes(menuName));
  }
  res.json(success_response(data));
});

// app.get('', (req, res) => {
//   const JSON = 
//   res.json(JSON);
// });

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

