import fs from 'fs';

let c = fs.readFileSync('src/services/api.js', 'utf8');

c = c.replace(/(\}\s*catch\s*\(fallbackErr\)\s*\{\s*console\.warn\(\"Fallback plant fetch failed:\",\s*fallbackErr\);\s*const\s*retErr\s*=\s*\{\s*d:\s*\{\s*results:\s*\[\]\s*\}\s*\};\s*_masterDataCache\.plants\s*=\s*retErr;\s*return\s*retErr;\s*\})(\s*)\},\s*(?=\/\/\s*Fetch\s*Storage\s*Locations)/g, '$1$2})();$2_masterDataPromises.plants = promise;$2return promise;$2},');

c = c.replace(/(\}\s*catch\s*\(err\)\s*\{\s*console\.error\(\"Error fetching Warehouses:\",\s*err\);\s*delete\s*_masterDataPromises\.warehouses;\s*throw\s*err;\s*\})(\s*)\},\s*(?=\/\/\s*============================================)/g, '$1$2})();$2_masterDataPromises.warehouses = promise;$2return promise;$2},');

c = c.replace(/(\}\s*catch\s*\(error\)\s*\{\s*console\.warn\(\"Error fetching GTIN:\",\s*error\);\s*delete\s*_masterDataPromises\[cacheKey\];\s*return\s*null;\s*\})(\s*)\},\s*(?=\/\/\s*=====================================\s*)/g, '$1$2})();$2_masterDataPromises[cacheKey] = promise;$2return promise;$2},');

fs.writeFileSync('src/services/api.js', c);
console.log('Fixed api.js');
