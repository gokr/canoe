'use strict'
/* global angular */
angular.module('canoeApp.controllers').controller('tabSendController', function ($scope, $rootScope, $log, $timeout, $ionicScrollDelegate, $ionicPopover, addressbookService, profileService, lodash, $state, incomingData, popupService, platformInfo, gettextCatalog, scannerService, externalLinkService, opencapService) {
  var originalList
  var completeContacts
  var CONTACTS_SHOW_LIMIT
  var currentContactsPage
  $scope.isChromeApp = platformInfo.isChromeApp
  $scope.serverMessage = null

  var updateAccountsList = function () {
    $scope.showTransferCard = $scope.hasMoreAccounts
    $scope.hasFunds = profileService.hasFunds()
    if ($scope.showTransferCard) {
      var accountList = []
      lodash.each($scope.accounts, function (acc) {
        accountList.push({
          meta: acc.meta,
          color: acc.meta.color,
          name: acc.name,
          alias: lodash.isObject(v) ? v.alias : null,
          avatar: lodash.isObject(v) ? v.avatar : null,
          recipientType: 'account',
          address: acc.id
        })
      })
      originalList = originalList.concat(accountList)
    }
  }

  var updateContactsList = function (cb) {
    addressbookService.list(function (err, ab) {
      if (err) $log.error(err)

      $scope.hasContacts = !lodash.isEmpty(ab)
      if (!$scope.hasContacts) return cb()

      completeContacts = []
      lodash.each(ab, function (v, k) {
        completeContacts.push({
          name: lodash.isObject(v) ? v.name : v,
          address: k,
          email: lodash.isObject(v) ? v.email : null,
          alias: lodash.isObject(v) ? v.alias : null,
          avatar: lodash.isObject(v) ? v.avatar : null,
          recipientType: 'contact',
          getAddress: function (cb) {
            return cb(null, k)
          }
        })
      })
      var contacts = completeContacts.slice(0, (currentContactsPage + 1) * CONTACTS_SHOW_LIMIT)
      $scope.contactsShowMore = completeContacts.length > contacts.length
      $scope.contactsShowMoreSaved = $scope.contactsShowMore
      originalList = originalList.concat(contacts)
      return cb()
    })
  }

  var updateList = function () {
    $scope.list = lodash.clone(originalList)
    $timeout(function () {
      $ionicScrollDelegate.resize()
      $scope.$apply()
    }, 10)
  }

  $scope.openScanner = function () {
    var isWindowsPhoneApp = platformInfo.isCordova && platformInfo.isWP

    if (!isWindowsPhoneApp) {
      $state.go('tabs.scan')
      return
    }

    scannerService.useOldScanner(function (err, contents) {
      if (err) {
        popupService.showAlert(gettextCatalog.getString('Error'), err)
        return
      }
      incomingData.redir(contents, $scope.acc.id)
    })
  }

  $scope.showMore = function () {
    currentContactsPage++
    originalList = []
    updateAccountsList()
    updateContactsList(function () {
      updateList()
    })
  }

  $scope.searchInFocus = function () {
    $scope.searchFocus = true
  }

  $scope.searchBlurred = function () {
    if ($scope.formData.search === null || $scope.formData.search.length === 0) {
      $scope.searchFocus = false
    }
  }

  $scope.closePopover = function() {
      $scope.popover.hide();
  };

  $scope.$on('$destroy', function() {
      $scope.popover.remove();
  });

  $scope.confirmOpenapAddress = function(address){
    $scope.popover.remove();
    $scope.findContact(address);
  }

  $scope.resolveOpencapAlias = function(alias){
    opencapService.getAddress(alias)
    .then(result => {
      $scope.opencapAddress = result.address;
      $scope.opencapDnssec = result.dnssec;
      $ionicPopover.fromTemplateUrl('templates/popoverAliasSend.html', {scope: $scope})
      .then(function(popover) {
          $scope.popover = popover;
          popover.show(angular.element(document.querySelector('#search-input')))
      });
    })
    .catch(status => {
      // do nothing because they may have been typing
    });
  }

  $scope.findContact = function (search) {
    $scope.resolveOpencapAlias(search);

    // If redir returns true it matched something and
    // will already have moved us to amount.
    incomingData.redir(search, $scope.acc.id, function (err, code) {
      if (err) {
        // Ok, redir did not match anything, then we search
        if (!search || search.length < 2) {
          $scope.list = originalList
          $scope.contactsShowMore = $scope.contactsShowMoreSaved
          $timeout(function () {
            $scope.$apply()
          })
          return
        }
        var sea = search.toLowerCase()
        var result = lodash.filter(completeContacts, function (item) {
          return (
            // If name has substring, or address startsWith, or email startsWith
            // or alias startsWith
            lodash.includes(item.name.toLowerCase(), sea) ||
            (item.address && item.address.toLowerCase().startsWith(sea)) ||
            (item.alias && item.alias.alias && item.alias.alias.toLowerCase().startsWith(sea)) ||
            (item.email && item.email.toLowerCase().startsWith(sea))
          )
        })
        $scope.list = result
        $scope.contactsShowMore = false
      }
    })
  }

  $scope.goToAmount = function (item) {
    $timeout(function () {
      var toAlias = null
      if (item.meta && item.meta.alias && item.meta.alias.alias) {
        toAlias = item.meta.alias.alias
      }
      return $state.transitionTo('tabs.send.amount', {
        recipientType: item.recipientType,
        toAddress: item.address,
        toName: item.name,
        toEmail: item.email,
        toColor: item.color,
        toAlias: toAlias,
        fromAddress: $scope.acc.id
      })
    })
  }

  $rootScope.$on('servermessage', function (event, message) {
    $scope.serverMessage = message
    $timeout(function () {
      $scope.$apply()
    })
  })

  $scope.openServerMessageLink = function () {
    var url = $scope.serverMessage.link
    externalLinkService.open(url)
  }

  // This could probably be enhanced refactoring the routes abstract states
  $scope.createAccount = function () {
    $state.go('tabs.home').then(function () {
      $state.go('tabs.create-account')
    })
  }

  $scope.buyBitcoin = function () {
    $state.go('tabs.home').then(function () {
      $state.go('tabs.buyandsell')
    })
  }

  $scope.onAccountSelect = function (acc) {
    if (!acc) {
      $state.go('tabs.create-account')
    } else {
      $scope.acc = acc
      $scope.account = acc
    }
  }

  $scope.showAccountSelector = function () {
    if ($scope.singleAccount) return
    $scope.accountSelectorTitle = gettextCatalog.getString('Select an account')
    $scope.showAccounts = true
  }

  var checkSelectedAccount = function (account, accounts) {
    if (!account) return accounts[0]
    var w = lodash.findIndex(accounts, function (w) {
      return w.id === account.id
    })
    if (!w) return accounts[0]
    return accounts[w]
  }

  $scope.$on('$ionicView.beforeEnter', function (event, data) {
    $scope.accounts = profileService.getAccounts()
    $scope.singleAccount = $scope.accounts.length === 1
    $scope.hasAccounts = !lodash.isEmpty($scope.accounts)
    var selectedAccount = checkSelectedAccount($scope.acc, $scope.accounts)
    $scope.onAccountSelect(selectedAccount)
    $scope.accountSelectorTitle = gettextCatalog.getString('Select an account')
    $scope.hasMoreAccounts = $scope.accounts.length > 1
    $scope.checkingBalance = true
    $scope.formData = {
      search: null
    }
    originalList = []
    CONTACTS_SHOW_LIMIT = 50
    currentContactsPage = 0
  })

  $scope.$on('$ionicView.enter', function (event, data) {
    if (!$scope.hasAccounts) {
      $scope.checkingBalance = false
      return
    }
    updateAccountsList()
    updateContactsList(function () {
      updateList()
    })
  })
})
