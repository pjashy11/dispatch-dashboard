import moment from 'moment';
import { isArray } from 'lodash';
import Axios, { AxiosPromise } from 'axios';

import { ManageLoadService } from '../../../../load/services/ManageLoadService';
import { IFilterType } from '../../../../../core/types/ProfileTypes';
import { Pagination } from '../types/PaginationType';
import {
  getTransformedTerminalIdFilter,
  localFilterOnly,
  parseStaticFilterToQueryParam,
  setExtraPropsToBackend
} from '../utils/DispatchUtil';

class DispatchLoadService extends ManageLoadService {
  constructor() {
    super();
  }

  public getAllLoadDispatch(status: string, filters: IFilterType[], pagination: Pagination): AxiosPromise<any[]> {
    return this.httpAxios
      .get('', { params: this.extractParamsForFilterPaginate(status, filters, pagination) })
      .then(response => response)
      .catch(err => {
        throw err;
      });
  }

  getLoadsDispatch = (
    status: string,
    filters: IFilterType[],
    pagination: Pagination,
    dynamicFilters: IFilterType[]
  ): AxiosPromise<any[]> => {
    const queryParams = parseStaticFilterToQueryParam(status, filters);
    const parsedFilters = setExtraPropsToBackend(dynamicFilters.filter(item => !localFilterOnly.includes(item.field)));
    const terminalIdFilter = filters.find(filter => filter.field === 'terminalIds');
    const filtersBackend = {
      filters: [terminalIdFilter && getTransformedTerminalIdFilter(terminalIdFilter), ...parsedFilters]
    };

    const { size, page } = pagination;
    const atleastOneLocalFilter = this.findFilters(dynamicFilters, localFilterOnly);
    const sendPagination = `${!atleastOneLocalFilter && `&limit=${size}&page=${page}`}`;

    return this.httpAxios
      .post(`/dispatch${queryParams}${sendPagination}`, JSON.stringify(filtersBackend))
      .then(response => response)
      .catch(err => {
        throw err;
      });
  };

  removeRejectWarning = (data: any): AxiosPromise<any> => {
    return this.httpAxios
      .post(`rejectWarning`, data)
      .then(response => response)
      .catch(err => {
        throw err;
      });
  };

  findFilters = (filters: IFilterType[], localFilters: string[]) => {
    return filters.some(element => {
      return localFilters.includes(element.field);
    });
  };

  extractParamsForFilterPaginate = (status: string, filters: IFilterType[], page: Pagination) => {
    const params: any = {};
    filters.push({ field: 'status', value: status, operator: 'EQUALITY' });
    filters.push({ field: 'isIncludeRateSheet', value: false, operator: 'EQUALITY' });
    if (isArray(filters) && filters.length > 0) {
      filters.forEach((filter: IFilterType) => {
        if (
          [
            'assignedPickUpDateStartEnd',
            'assignedPickUpDate',
            'accountId',
            'includeHistoricalLoads',
            'commodityId',
            'isIncludeRateSheet',
            'isLeaseSiteOilDepotAllDetails',
            'isLeaseTankList',
            'status',
            'selectedDriverId',
            'lastDropReturn',
            'shiftDate'
          ].includes(filter.field)
        ) {
          if (filter.field === 'assignedPickUpDateStartEnd') {
            params['assignedPickUpDateStart'] = moment(filter.value[0]).format('MM/DD/YYYY');
            params['assignedPickUpDateEnd'] = moment(filter.value[1]).format('MM/DD/YYYY');
            return;
          }
          params[filter.field] = filter.value;
        }
        if (filter.field === 'terminalIds') {
          params['terminalId'] = 0;
          params['data'] = {
            filters: [
              {
                field: 'terminalIds',
                value: filter.value,
                operator: 'IN'
              }
            ]
          };
        }
        if (filter.field === 'contractorId') {
          params['data']['filters'].push({
            field: 'contractorId',
            value: filter.value,
            operator: 'IN'
          });
        }
      });
    }

    return { ...params, ...page };
  };

  public updateLoadContractorAssigned = (loadId: number, contractorId: number): AxiosPromise<any> => {
    return this.httpAxios
      .put(`updateLoadContractor/${loadId}/${contractorId}`, {})
      .then(response => response)
      .catch(err => {
        throw err;
      });
  };

  public rerouteAssignedLoad = (params: any) => {
    const { loadId, reRouteToDropOffAccountId, reRouteToDropOffId, loadedMiles, isUpdateLoadedMiles, dynamicValues } =
      params;
    return this.httpAxios
      .put(
        `schedule/rerouteLoadToDifferentDropOff/${loadId}/${reRouteToDropOffAccountId}/${reRouteToDropOffId}/${loadedMiles}/${isUpdateLoadedMiles}`,
        dynamicValues,
        { baseURL: `${process.env.REACT_APP_API_URL}` }
      )
      .then(response => response)
      .catch(err => {
        throw err;
      });
  };

  createURLsfromDriverList = (params: any): any[] => {
    const { driverList, pickUpIds, dropOffIds } = params;
    let requests: any[] = [];
    driverList?.forEach((item: any) => {
      let requestParams = { pickUpIds, dropOffIds, driverId: item };
      requests.push(
        this.httpAxios.post(`load/validaterequirements`, requestParams, {
          baseURL: `${process.env.REACT_APP_API_URL}`
        })
      );
    });
    return requests;
  };

  public validateMultipleRequirements = async (params: any) => {
    return Axios.all(this.createURLsfromDriverList(params))
      .then(responses => responses)
      .catch(err => {
        throw err;
      });
  };

  public validateRequirements = async (params: any) => {
    try {
      const response = await this.httpAxios.post(`load/validaterequirements`, params, {
        baseURL: `${process.env.REACT_APP_API_URL}`
      });
      return response;
    } catch (err) {
      throw (err as any).response;
    }
  };
}
const dispatchLoadService = new DispatchLoadService();
export default dispatchLoadService;
