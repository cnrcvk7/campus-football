from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """
    Default pagination for all list endpoints.

    Query params:
        ?page=<n>           — page number (1-based)
        ?page_size=<n>      — override page size (max 100)
    """
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 100
