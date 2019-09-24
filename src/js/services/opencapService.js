'use strict';

(function() {
  angular.module('canoeApp.services').factory('opencapService', function($q, $http) {
    function getAddress(alias) {
      let aliasData = validateAlias(alias);
      if (aliasData.username === '' || aliasData.domain === '') {
        return $q((resolve, reject) => {
          return reject('Invalid OpenCAP alias');
        });
      }

      let deferred = $q.defer();
      $http
        .get(`https://dns.google.com/resolve?name=_opencap._tcp.${aliasData.domain}&type=SRV`)
        .then(function(response) {
          deferred.resolve(
            parseSRV(response.data)
              .then(data => getAddressReqeust(alias, data.host, data.dnssec))
              .catch(function(error) {
                return $q((resolve, reject) => {
                  reject(error);
                });
              })
          );
        })
        .catch(function(response) {
          deferred.reject("Couldn't find srv record for the provided domain");
        });
      return deferred.promise;
    }

    var parseSRV = function(respData) {
      return $q((resolve, reject) => {
        let dnssec = respData.AD;

        if (typeof respData.Answer === 'undefined') {
          return reject('Error contacting google dns server, no srv data');
        }
        if (respData.Answer.length < 1) {
          return reject('Error contacting google dns server, not enough srv data');
        }

        let record = respData.Answer[0].data.split(' ');
        if (record.length != 4) {
          return reject('Error contacting google dns server, improper srv data');
        }

        if (record[3].slice(-1) == '.') {
          record[3] = record[3].substring(0, record[3].length - 1);
        }

        return resolve({ host: record[3], dnssec });
      });
    };

    var getAddressReqeust = function(alias, host, dnssec) {
      let deferred = $q.defer();
      $http
        .get(`https://${host}/v1/addresses?alias=${alias}&address_type=300`)
        .then(function(response) {
          deferred.resolve(parseAddress(response.data, dnssec).then());
        })
        .catch(function(response) {
          deferred.reject('Address not found for the specified alias');
        });
      return deferred.promise;
    };

    var parseAddress = function(respData, dnssec) {
      return $q((resolve, reject) => {
        if (respData.address_type === 'undefined') {
          return reject('Error contacting opencap server, no response');
        }
        if (respData.address === 'undefined') {
          return reject('Error contacting opencap server, no response');
        }
        return resolve({ address: respData.address, dnssec });
      });
    };

    function updateAddress(alias, password, address) {
      let aliasData = validateAlias(alias);
      if (aliasData.username === '' || aliasData.domain === '') {
        return $q((resolve, reject) => {
          return reject('Invalid OpenCAP alias');
        });
      }

      let deferred = $q.defer();
      $http
        .get(`https://dns.google.com/resolve?name=_opencap._tcp.${aliasData.domain}&type=SRV`)
        .then(function(response) {
          deferred.resolve(
            parseSRV(response.data)
              .then(data =>
                loginRequest(alias, password, data.host)
                  .then(jwt => updateAddressRequest(alias, address, data.host, jwt))
                  .catch(function(error) {
                    return $q((resolve, reject) => {
                      reject(error);
                    });
                  })
              )
              .catch(function(error) {
                return $q((resolve, reject) => {
                  reject(error);
                });
              })
          );
        })
        .catch(function(response) {
          deferred.reject("Couldn't find srv record for the provided domain");
        });
      return deferred.promise;
    }

    function updateAddressRequest(alias, address, host, jwt) {
      let deferred = $q.defer();
      let headers = new Headers({
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      });
      let options = new RequestOptions({ headers: headers });
      const nano_address_type = 300;
      $http
        .put(`https://${host}/v1/addresses`, { address_type: nano_address_type, address }, options)
        .then(function(response) {
          deferred.resolve('Alias was updated succesfully');
        })
        .catch(function(response) {
          deferred.reject('Failed to update alias');
        });
      return deferred.promise;
    }

    function loginRequest(alias, password, host) {
      let deferred = $q.defer();
      let headers = new Headers({ 'Content-Type': 'application/json' });
      let options = new RequestOptions({ headers: headers });
      $http
        .post(`https://${host}/v1/auth`, { alias, password }, options)
        .then(function(response) {
          deferred.resolve(parseJWT(response.data).then());
        })
        .catch(function(response) {
          deferred.reject('Invalid login credentials');
        });
      return deferred.promise;
    }

    var parseJWT = function(respData) {
      return $q((resolve, reject) => {
        if (respData.jwt === 'undefined') {
          return reject('Error contacting opencap server, no response');
        }
        return resolve(respData.jwt);
      });
    };

    function validateUsername(username) {
      return /^[a-z0-9._-]{1,25}$/.test(username);
    }

    function validateDomain(username) {
      return /^[a-z0-9.\-]+\.[a-z]{2,4}$/.test(username);
    }

    function validateAlias(alias) {
      let splitAlias = alias.split('$');
      if (splitAlias.length != 2) {
        return { username: '', domain: '' };
      }
      let username = splitAlias[0];
      let domain = splitAlias[1];

      if (!validateUsername(username)) {
        return { username: '', domain: '' };
      }
      if (!validateDomain(domain)) {
        return { username: '', domain: '' };
      }

      return { username, domain };
    }

    var service = {
      updateAddress,
      getAddress,
    };

    return service;
  });
})();
