const fs = require('fs');

const cpFile = 'c:/Users/nikh8/PR/pr-app/src/pages/outbound/ConfirmPicking.jsx';
let cp = fs.readFileSync(cpFile, 'utf8');
cp = cp.replace(
    /navigate\('\/warehouse-outbound\/picking'\);/g,
    `navigate('/warehouse-outbound/picking', { state: { successMsg: \`Task \${taskId} confirmed successfully!\`, confirmedTaskId: taskId } });`
);
fs.writeFileSync(cpFile, cp);

const pFile = 'c:/Users/nikh8/PR/pr-app/src/pages/inbound/ConfirmPutaway.jsx';
let pp = fs.readFileSync(pFile, 'utf8');
pp = pp.replace(
    /navigate\('\/warehouse-inbound\/putaway', {\s+state: { successMsg: `Task \${taskId} confirmed successfully!` }\s+}\);/g,
    `navigate('/warehouse-inbound/putaway', {
                    state: { successMsg: \`Task \${taskId} confirmed successfully!\`, confirmedTaskId: taskId }
                });`
);
fs.writeFileSync(pFile, pp);

console.log("Done");
